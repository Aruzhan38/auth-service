"""
Locust Load Test — Auth Service
================================
Run with:
  pip install locust
  locust -f locustfile.py --host=http://localhost:3002
 
Then open: http://localhost:8089
Set users: 100, spawn rate: 10, and watch HPA scale!
"""
 
import random
import string
from locust import HttpUser, task, between
 
 
def random_email():
    suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=8))
    return f"user_{suffix}@test.com"
 
 
class AuthUser(HttpUser):
    """Simulates a real user: registers, logs in, verifies token."""
 
    wait_time = between(0.5, 2)  # wait 0.5–2s between tasks
    token = None
 
    def on_start(self):
        """Called once when a simulated user starts — registers and logs in."""
        self.email = random_email()
        self.password = "Password123!"
 
        # Register
        self.client.post("/api/auth/register", json={
            "email": self.email,
            "password": self.password,
            "name": "Load Test User"
        })
 
        # Login and store token
        response = self.client.post("/api/auth/login", json={
            "email": self.email,
            "password": self.password
        })
        if response.status_code == 200:
            self.token = response.json().get("token")
 
    @task(5)
    def verify_token(self):
        """Most frequent task — simulates API calls that verify JWT.
        Weight 5 = called 5x more than login."""
        if self.token:
            self.client.get(
                "/api/auth/verify",
                headers={"Authorization": f"Bearer {self.token}"},
                name="/api/auth/verify"
            )
 
    @task(2)
    def login(self):
        """Simulate repeated logins (weight 2)."""
        response = self.client.post("/api/auth/login", json={
            "email": self.email,
            "password": self.password
        }, name="/api/auth/login")
 
        if response.status_code == 200:
            self.token = response.json().get("token")
 
    @task(1)
    def health_check(self):
        """Lightweight health probe (weight 1)."""
        self.client.get("/health", name="/health")
 
    @task(1)
    def invalid_login(self):
        """Simulate failed logins to test error rate SLI."""
        self.client.post("/api/auth/login", json={
            "email": "nonexistent@test.com",
            "password": "wrongpassword"
        }, name="/api/auth/login [fail]")