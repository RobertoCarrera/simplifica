# Security Audit Report - April 2026

## Executive Summary
This report outlines critical security findings in the "Simplifica" CRM platform. The audit focused on RLS policies, Edge Functions, and Multi-tenancy isolation.

**Total Findings:** 4
**Critical:** 2
**High:** 2
**Medium:** 0

---

## Detailed Findings

### 1. [CRITICAL] Cross-Tenant Data Leak in `payment_integrations`
**Description:**
The RLS policies for `payment_integrations` check for role membership (`owner`, `admin`) but **fail to filter by `company_id`**.
**Impact:**
An admin of Company A can read/write payment credentials (Stripe/PayPal secrets) of Company B, C, etc. This is a complete breakdown of multi-tenancy for this table.
**Status:** Fixing in this PR.

### 2. [CRITICAL] Global Access & Missing Isolation in `item_tags`
**Description:**
The `item_tags` table lacks a `company_id` column. Its RLS policies allow `SELECT`, `INSERT`, `DELETE` to ALL authenticated users (`TO authenticated USING (true)`).
**Impact:**
Any user (even a client) can see all internal tags of all companies. This leaks business intelligence and metadata.
**Status:** Reported. Requires schema change (ADD COLUMN) and backfill.

### 3. [HIGH] "Fail Open" Authentication in Payment Webhooks
**Description:**
`payment-webhook-stripe` and `payment-webhook-paypal` edge functions skip signature verification if the integration or secret is missing from the database.
**Impact:**
An attacker can bypass signature checks by targeting a company without a configured secret or by simply omitting the signature header, potentially injecting fake payment events.
**Status:** Fixing in this PR (Changing to "Fail Closed").

### 4. [HIGH] Unauthenticated Debug Endpoints in `verifactu-dispatcher`
**Description:**
The `verifactu-dispatcher` function exposes `debug-test-update`, `debug-env`, `debug-last-event`, and `debug-aeat-process` actions. These are accessible via POST without specific authorization checks (beyond general function invocation).
**Impact:**
Information disclosure (environment variables, event history) and potential data corruption (test updates).
**Status:** Fixing in this PR (Removing endpoints).
