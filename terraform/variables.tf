variable "kube_context" {
  description = "Kubernetes context to use (minikube for local)"
  type        = string
  default     = "minikube"
}

variable "namespace" {
  description = "Kubernetes namespace for all resources"
  type        = string
  default     = "auth-service"
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "development"
}

variable "docker_image" {
  description = "Docker image name (e.g. yourdockerhubuser/auth-service)"
  type        = string
}

variable "image_tag" {
  description = "Docker image tag to deploy"
  type        = string
  default     = "latest"
}

variable "replicas" {
  description = "Initial number of auth-service replicas"
  type        = number
  default     = 2
}

variable "hpa_min_replicas" {
  description = "Minimum pods for HPA"
  type        = number
  default     = 2
}

variable "hpa_max_replicas" {
  description = "Maximum pods for HPA"
  type        = number
  default     = 10
}

variable "jwt_secret" {
  description = "JWT signing secret — keep this safe, never commit"
  type        = string
  sensitive   = true
}

variable "db_password" {
  description = "PostgreSQL password"
  type        = string
  sensitive   = true
  default     = "authpassword"
}

variable "redis_password" {
  description = "Redis password (empty = no auth)"
  type        = string
  sensitive   = true
  default     = ""
}
