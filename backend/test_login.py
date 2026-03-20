import requests
import json

BASE_URL = "http://localhost:8000"

def test_login(username, password):
    resp = requests.post(
        f"{BASE_URL}/auth/login",
        data={"username": username, "password": password}
    )
    if resp.status_code == 200:
        data = resp.json()
        token = data.get("access_token") or data.get("token")
        print(f"[PASS] Login: {username}")
        return token
    else:
        print(f"[FAIL] Login: {username} -> {resp.status_code}: {resp.text[:100]}")
        return None

def test_insurers(token):
    resp = requests.get(
        f"{BASE_URL}/users/insurers",
        headers={"Authorization": f"Bearer {token}"}
    )
    if resp.status_code == 200:
        data = resp.json()
        names = [i["username"] for i in data]
        print(f"[PASS] GET /users/insurers -> {names}")
        return data
    else:
        print(f"[FAIL] GET /users/insurers -> {resp.status_code}: {resp.text[:100]}")
        return None

def test_claims_list(token, label):
    resp = requests.get(
        f"{BASE_URL}/claims",
        headers={"Authorization": f"Bearer {token}"}
    )
    if resp.status_code == 200:
        data = resp.json()
        print(f"[PASS] GET /claims as {label} -> {len(data)} claims")
    else:
        print(f"[FAIL] GET /claims as {label} -> {resp.status_code}: {resp.text[:100]}")

print("=" * 50)
print("CLAIMFLOW VERIFICATION")
print("=" * 50)

# 1. Login tests
print("\n--- Login Tests ---")
h1 = test_login("demo_hospital", "password123")
h2 = test_login("demo_hospital_2", "password123")
i1 = test_login("demo_insurer", "password123")
i2 = test_login("demo_insurer_2", "password123")

# 2. Insurers endpoint
print("\n--- Insurers Endpoint ---")
if h1:
    test_insurers(h1)

# 3. Claims list (should be empty, but verifies route works)
print("\n--- Claims List (Isolation) ---")
if i1:
    test_claims_list(i1, "demo_insurer")
if i2:
    test_claims_list(i2, "demo_insurer_2")

print("\n" + "=" * 50)
print("VERIFICATION COMPLETE")
print("=" * 50)
