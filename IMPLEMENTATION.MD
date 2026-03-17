# Security Layer Implementation Status

This document reviews the current status of the security layer in the codebase and outlines the implementation plan for any pending features.

## 1. Username & Password Login
- **Status:** **Implemented**
- **Details:** The `/auth/login` endpoint correctly accepts `OAuth2PasswordRequestForm` containing the username and password. The password verification logic is handled via Bcrypt hashing (`pwd_context.verify`) inside `utils/security.py`, and the authentication workflow is executed in `api/controller/auth_controller.py`.

## 2. Authentication & Authorization with Role Management
- **Status:** **Implemented**
- **Details:** The application uses `UserRole` (HOSPITAL, INSURER) enums for role management. The `require_role(required_roles: list[UserRole])` dependency in `utils/security.py` enforces role-based access control, ensuring that only users with the correct privileges can access specific endpoints.

## 3. JWT Token (Access Token & Refresh Token)
- **Status:** **Implemented**
- **Details:** The system generates both Access Tokens (short-lived, 30 minutes) and Refresh Tokens (long-lived, 7 days). These tokens are signed using `HS256` and issued securely as `HttpOnly` cookies. Token generation and validation logic reside in `utils/security.py`, while the `/auth/refresh` endpoint handles access token rotation.

## 4. `login_required` Annotation for Each API Call
- **Status:** **Implemented**
- **Details:** The FastAPI dependency injection system is actively used to enforce authentication on secured endpoints. Endpoints leverage `current_user: User = Depends(get_current_active_user)` to ensure the user is logged in, and `Depends(require_role([...]))` to enforce specific roles. This is effectively the FastApi equivalent of a `@login_required` annotation.

## 5. Forgot Password
- **Status:** **Pending Implementation**
- **Proposed Implementation Plan:**
  1. Create a `PasswordResetToken` model in `model/models.py` (or extend `User` model) to store generic reset tokens, along with expiration timestamps.
  2. Implement an `/auth/forgot-password` endpoint in `api/routes/auth.py` that accepts an email/username and generates a secure reset token.
  3. (Optional) Integrate an email service or mock a background task to send the reset token to the user.
  4. Ensure the UI includes a "Forgot Password" link on the login page, routing to an input form for token generation.

## 6. Update Password
- **Status:** **Pending Implementation**
- **Proposed Implementation Plan:**
  1. Implement an `/auth/update-password` endpoint in `api/routes/auth.py`.
  2. The endpoint will handle two scenarios:
     - **Authenticated Update:** Takes the `current_password` and `new_password` for logged-in users who just want to change their password.
     - **Reset via Token:** Takes a `reset_token` and a `new_password` for users who forgot their password.
  3. The business logic inside `api/controller/auth_controller.py` will verify the token/current password, hash the new password using `utils/security.py`, and store it in the database.
  4. Create a "Change Password" form in the frontend under user settings or profile.
