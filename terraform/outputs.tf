output "auth_service_url" {
  description = "Auth service URL on minikube"
  value       = "http://$(minikube ip):30080"
}

output "grafana_url" {
  description = "Grafana dashboard URL"
  value       = "http://$(minikube ip):30030"
}

output "namespace" {
  description = "Kubernetes namespace"
  value       = kubernetes_namespace.auth.metadata[0].name
}

output "docker_image_deployed" {
  description = "Docker image currently deployed"
  value       = "${var.docker_image}:${var.image_tag}"
}
