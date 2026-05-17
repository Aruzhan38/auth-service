terraform {
  required_version = ">= 1.5.0"

  required_providers {
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.23"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.11"
    }
  }

  # State stored locally (for minikube)
  backend "local" {
    path = "terraform.tfstate"
  }
}

# ─── Providers ────────────────────────────────────────────────────────────────
provider "kubernetes" {
  config_path    = "~/.kube/config"
  config_context = var.kube_context
}

provider "helm" {
  kubernetes {
    config_path    = "~/.kube/config"
    config_context = var.kube_context
  }
}

# ─── Namespace ────────────────────────────────────────────────────────────────
resource "kubernetes_namespace" "auth" {
  metadata {
    name = var.namespace
    labels = {
      app         = "auth-service"
      environment = var.environment
    }
  }
}

# ─── Secret: JWT + DB + Redis credentials ─────────────────────────────────────
resource "kubernetes_secret" "auth_secrets" {
  metadata {
    name      = "auth-secrets"
    namespace = kubernetes_namespace.auth.metadata[0].name
  }

  data = {
    JWT_SECRET    = var.jwt_secret
    DB_PASSWORD   = var.db_password
    REDIS_PASSWORD = var.redis_password
  }
}

# ─── ConfigMap: Non-sensitive config ──────────────────────────────────────────
resource "kubernetes_config_map" "auth_config" {
  metadata {
    name      = "auth-config"
    namespace = kubernetes_namespace.auth.metadata[0].name
  }

  data = {
    PORT          = "3000"
    NODE_ENV      = var.environment
    DB_HOST       = "postgres-service"
    DB_PORT       = "5432"
    DB_NAME       = "authdb"
    DB_USER       = "authuser"
    REDIS_HOST    = "redis-service"
    REDIS_PORT    = "6379"
    JWT_EXPIRES_IN = "1h"
  }
}

# ─── PostgreSQL Deployment ────────────────────────────────────────────────────
resource "kubernetes_deployment" "postgres" {
  metadata {
    name      = "postgres"
    namespace = kubernetes_namespace.auth.metadata[0].name
  }

  spec {
    replicas = 1

    selector {
      match_labels = { app = "postgres" }
    }

    template {
      metadata {
        labels = { app = "postgres" }
      }

      spec {
        container {
          name  = "postgres"
          image = "postgres:16-alpine"

          port {
            container_port = 5432
          }

          env {
            name  = "POSTGRES_DB"
            value = "authdb"
          }
          env {
            name  = "POSTGRES_USER"
            value = "authuser"
          }
          env {
            name = "POSTGRES_PASSWORD"
            value_from {
              secret_key_ref {
                name = kubernetes_secret.auth_secrets.metadata[0].name
                key  = "DB_PASSWORD"
              }
            }
          }

          resources {
            requests = { memory = "128Mi", cpu = "100m" }
            limits   = { memory = "256Mi", cpu = "250m" }
          }
        }
      }
    }
  }
}

resource "kubernetes_service" "postgres" {
  metadata {
    name      = "postgres-service"
    namespace = kubernetes_namespace.auth.metadata[0].name
  }

  spec {
    selector = { app = "postgres" }
    port {
      port        = 5432
      target_port = 5432
    }
  }
}

# ─── Redis Deployment ─────────────────────────────────────────────────────────
resource "kubernetes_deployment" "redis" {
  metadata {
    name      = "redis"
    namespace = kubernetes_namespace.auth.metadata[0].name
  }

  spec {
    replicas = 1

    selector {
      match_labels = { app = "redis" }
    }

    template {
      metadata {
        labels = { app = "redis" }
      }

      spec {
        container {
          name  = "redis"
          image = "redis:7-alpine"

          port {
            container_port = 6379
          }

          resources {
            requests = { memory = "64Mi", cpu = "50m" }
            limits   = { memory = "128Mi", cpu = "100m" }
          }
        }
      }
    }
  }
}

resource "kubernetes_service" "redis" {
  metadata {
    name      = "redis-service"
    namespace = kubernetes_namespace.auth.metadata[0].name
  }

  spec {
    selector = { app = "redis" }
    port {
      port        = 6379
      target_port = 6379
    }
  }
}

# ─── Auth Service Deployment ──────────────────────────────────────────────────
resource "kubernetes_deployment" "auth_service" {
  metadata {
    name      = "auth-service"
    namespace = kubernetes_namespace.auth.metadata[0].name
    labels    = { app = "auth-service" }
  }

  spec {
    replicas = var.replicas

    selector {
      match_labels = { app = "auth-service" }
    }

    template {
      metadata {
        labels = { app = "auth-service" }
        annotations = {
          "prometheus.io/scrape" = "true"
          "prometheus.io/port"   = "3000"
          "prometheus.io/path"   = "/metrics"
        }
      }

      spec {
        container {
          name  = "auth-service"
          image = "${var.docker_image}:${var.image_tag}"

          port {
            container_port = 3000
          }

          # Load all non-sensitive config from ConfigMap
          env_from {
            config_map_ref {
              name = kubernetes_config_map.auth_config.metadata[0].name
            }
          }

          # Load secrets individually
          env {
            name = "JWT_SECRET"
            value_from {
              secret_key_ref {
                name = kubernetes_secret.auth_secrets.metadata[0].name
                key  = "JWT_SECRET"
              }
            }
          }

          # Liveness probe — restart pod if app is hung
          liveness_probe {
            http_get {
              path = "/health"
              port = 3000
            }
            initial_delay_seconds = 15
            period_seconds        = 20
          }

          # Readiness probe — only send traffic when app is ready
          readiness_probe {
            http_get {
              path = "/health"
              port = 3000
            }
            initial_delay_seconds = 10
            period_seconds        = 10
          }

          resources {
            requests = { memory = "128Mi", cpu = "100m" }
            limits   = { memory = "256Mi", cpu = "500m" }
          }
        }
      }
    }
  }
}

resource "kubernetes_service" "auth_service" {
  metadata {
    name      = "auth-service"
    namespace = kubernetes_namespace.auth.metadata[0].name
  }

  spec {
    selector = { app = "auth-service" }
    type     = "NodePort"

    port {
      port        = 80
      target_port = 3000
      node_port   = 30080
    }
  }
}

# ─── Horizontal Pod Autoscaler ────────────────────────────────────────────────
resource "kubernetes_horizontal_pod_autoscaler_v2" "auth_hpa" {
  metadata {
    name      = "auth-service-hpa"
    namespace = kubernetes_namespace.auth.metadata[0].name
  }

  spec {
    scale_target_ref {
      api_version = "apps/v1"
      kind        = "Deployment"
      name        = kubernetes_deployment.auth_service.metadata[0].name
    }

    min_replicas = var.hpa_min_replicas
    max_replicas = var.hpa_max_replicas

    metric {
      type = "Resource"
      resource {
        name = "cpu"
        target {
          type                = "Utilization"
          average_utilization = 60
        }
      }
    }
  }
}

# ─── Prometheus via Helm ──────────────────────────────────────────────────────
resource "helm_release" "prometheus" {
  name       = "prometheus"
  repository = "https://prometheus-community.github.io/helm-charts"
  chart      = "prometheus"
  namespace  = kubernetes_namespace.auth.metadata[0].name

  set {
    name  = "server.persistentVolume.enabled"
    value = "false"
  }
}

# ─── Grafana via Helm ─────────────────────────────────────────────────────────
resource "helm_release" "grafana" {
  name       = "grafana"
  repository = "https://grafana.github.io/helm-charts"
  chart      = "grafana"
  namespace  = kubernetes_namespace.auth.metadata[0].name

  set {
    name  = "adminPassword"
    value = "admin"
  }
  set {
    name  = "service.type"
    value = "NodePort"
  }
  set {
    name  = "service.nodePort"
    value = "30030"
  }
}
