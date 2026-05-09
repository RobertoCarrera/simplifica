# Google Workspace OAuth Setup Guide

This guide walks you through configuring Google Workspace OAuth2 credentials for the Simplifica CRM email integration.

---

## Overview

You have two options for sending email from your Google Workspace domain:

| Method | Pros | Cons |
|--------|------|------|
| **OAuth2 (recommended)** | No passwords, granular permissions, more secure, no App Password needed | Requires GCP setup |
| **App Passwords (SMTP)** | Quick to set up | Less secure, requires generating App Passwords, less granular permissions |

This guide covers **OAuth2** setup.

---

## Prerequisites

- A Google Workspace domain (e.g., `tuempresa.com`)
- A Google account with admin privileges OR the ability to create OAuth credentials
- Access to your Simplifica CRM installation

---

## Step 1: Create or Select a GCP Project

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. If you don't have a project:
   - Click **"Select a project"** → **"New Project"**
   - Name it (e.g., `simplifica-crm`)
   - Click **Create**
3. If you already have a project, select it from the dropdown

---

## Step 2: Enable the Gmail API

1. In the left sidebar, go to **APIs & Services** → **Library**
2. Search for **"Gmail API"**
3. Click on **Gmail API** in the results
4. Click **Enable**

---

## Step 3: Create OAuth2 Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **+ Create Credentials** → **OAuth client ID**
3. If prompted to configure the OAuth consent screen first, skip to Step 4
4. Select **Web application** as the application type
5. Fill in:
   - **Name**: `Simplifica CRM` (or any name you prefer)
6. Under **Authorized redirect URIs**, click **Add URI** and add:
   ```
   https://your-project-ref.supabase.co/functions/v1/company-email-accounts/google-callback
   ```
   Replace `your-project-ref` with your Supabase project reference (found in your Supabase project settings URL).
7. Click **Create**
8. Copy the **Client ID** and **Client Secret** — you'll need both

---

## Step 4: Configure the OAuth Consent Screen

1. Go to **APIs & Services** → **OAuth consent screen**
2. Choose **Internal** (recommended for Google Workspace) or **External**:
   - **Internal**: Only users within your Google Workspace organization can use the app
   - **External**: Any Google account can authorize (requires verification by Google)
3. Fill in the required fields:
   - **App name**: `Simplifica CRM`
   - **User support email**: Your Google Workspace email
   - **Developer contact**: Your email
4. Click **Save and continue**
5. On the **Scopes** page:
   - Click **Add or Remove Scopes**
   - Select only: `../auth/gmail.send` — "Send email on your behalf"
   - Click **Update**
6. Click **Save and continue**

---

## Step 5: Add the Redirect URI (Important!)

The redirect URI must match exactly what your Supabase Edge Function expects:

```
https://your-project-ref.supabase.co/functions/v1/company-email-accounts/google-callback
```

To add it:
1. Go to **APIs & Services** → **Credentials**
2. Click on the OAuth 2.0 Client ID you created in Step 3
3. Under **Authorized redirect URIs**, add the URI above
4. Click **Save**

> ⚠️ **If the redirect URI doesn't match exactly, the OAuth flow will fail.**

---

## Step 6: Understanding the `gmail.send` Scope

The only scope required is:

```
https://www.googleapis.com/auth/gmail.send
```

This scope allows the application to **send email** on behalf of the user. It does NOT allow reading emails or accessing other Gmail data. This is the principle of least privilege.

---

## Step 7: Add Credentials to Supabase

1. In your Supabase project, go to **Edge Functions** → **Secrets** (or `.env` files for local development)
2. Add:
   ```
   GOOGLE_OAUTH_CLIENT_ID=your-client-id
   GOOGLE_OAUTH_CLIENT_SECRET=your-client-secret
   ```
3. These values are shared across all companies using OAuth2 in your Simplifica installation

---

## Step 8: App Passwords (SMTP Fallback)

If you prefer SMTP over OAuth2, you can use **App Passwords** instead:

1. In your Google account, go to **Security**
2. Enable **2-Step Verification** if not already enabled
3. Go to **App Passwords** (under "Signing in to Google")
4. Select **Mail** and your device, then click **Generate**
5. Copy the 16-character password (format: `xxxx xxxx xxxx xxxx`)
6. Use this as the SMTP password in Simplifica CRM

> ⚠️ App Passwords are less secure than OAuth2. Treat them like regular passwords and store them securely.

---

## Troubleshooting

### "redirect_uri_mismatch" error
- Verify the redirect URI in GCP matches exactly: `https://your-project-ref.supabase.co/functions/v1/company-email-accounts/google-callback`
- Make sure there are no trailing slashes or extra characters

### "invalid_client" error
- Verify your `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` are correct
- Make sure the OAuth consent screen is configured

### "access_denied" error
- For **Internal** apps: make sure you're using an account from the same Google Workspace organization
- For **External** apps: your app may be pending verification by Google. During testing, you'll see a warning screen but can proceed.

### Token refresh failures
- The refresh token may have been revoked — reconnect via the "Connect with Google" button
- Check that the Gmail API is enabled in your GCP project

---

## Security Notes

- **Never commit OAuth credentials to version control**
- **Refresh tokens** are stored encrypted in your database
- **Access tokens** are kept in memory only — never persisted to the database
- **Minimum scope**: Only `gmail.send` is requested, not full Gmail access
- **State parameter**: A CSRF token is used to prevent replay attacks during OAuth initiation