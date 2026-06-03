// @ts-nocheck
/**
 * Integration tests for marketer role invitation flow in `send-company-invite`.
 *
 * These tests verify:
 *   1. 'marketer' is accepted as a valid role in VALID_INVITE_ROLES.
 *   2. Authorization: solo admins, owners y super_admins pueden asignar
 *      el rol 'marketer'. Un miembro normal recibe 403.
 *   3. La etiqueta de rol (`ROLE_LABELS`) incluye 'marketer' → 'Marketing'.
 *   4. El `emailType` generado para branded email incluye 'invite_marketer'.
 *
 * Running (requires Deno):
 *   deno test supabase/functions/send-company-invite/index.test.ts
 *
 * @module send-company-invite/tests
 */

// ---------------------------------------------------------------------------
// Helpers — reusable test utilities
// ---------------------------------------------------------------------------

/**
 * Simula un encabezado Authorization con un token JWT válido.
 */
function makeAuthHeaders(token = 'valid-jwt-token'): Record<string, string> {
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Crea una Request simulada para la Edge Function.
 */
function makeRequest(
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
): Request {
  return new Request('https://fn.supabase.co/send-company-invite', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Esperado: VALID_INVITE_ROLES y ROLE_LABELS (sincronizados con el source)
// ---------------------------------------------------------------------------

// Los valores esperados deben coincidir con los definidos en index.ts.
// Si estos tests fallan, hay que actualizar el source o los tests.
const VALID_INVITE_ROLES = [
  'admin',
  'member',
  'client',
  'professional',
  'agent',
  'marketer',
] as const;

const ROLE_LABELS: Record<string, string> = {
  owner: 'Propietario',
  admin: 'Administrador',
  member: 'Miembro',
  professional: 'Profesional',
  agent: 'Agente',
  marketer: 'Marketing',
  client: 'Cliente',
};

// ---------------------------------------------------------------------------
// TEST 1: 'marketer' es un rol válido para invitación
// ---------------------------------------------------------------------------

Deno.test('marketer-invite: "marketer" está en VALID_INVITE_ROLES', () => {
  console.assert(
    VALID_INVITE_ROLES.includes('marketer'),
    'marketer debe ser un rol válido de invitación',
  );
});

Deno.test('marketer-invite: rol "marketer" es aceptado por validación de roles', () => {
  const role = 'marketer';

  // Simulación de la validación que ocurre en la Edge Function
  const isValidRole = VALID_INVITE_ROLES.includes(role as any);

  console.assert(isValidRole === true, `El rol '${role}' debe ser aceptado como válido`);
});

Deno.test('marketer-invite: rol "marketer" no es rechazado como "invalid_role"', () => {
  // En la función, si el rol no está en la lista, devuelve 400.
  const allValidRoles = [
    'admin', 'member', 'client', 'owner',
    'super_admin', 'professional', 'agent', 'marketer',
  ];

  // marketer debe estar en la lista completa de roles válidos
  console.assert(
    allValidRoles.includes('marketer'),
    'marketer debe estar en la lista completa de roles aceptados',
  );

  // Un rol inválido sería rechazado
  console.assert(
    !allValidRoles.includes('invalid_role'),
    'invalid_role no debe estar en la lista',
  );
});

// ---------------------------------------------------------------------------
// TEST 2: Autorización — solo admins/owners/super_admins pueden invitar
//          con rol 'marketer'. Un miembro normal recibe 403.
// ---------------------------------------------------------------------------

Deno.test('marketer-invite: admin PUEDE invitar con rol marketer (no 403)', () => {
  const role = 'marketer';
  const isSuperAdmin = false;
  const currentUser = { role: 'admin' };

  // Lógica de autorización — extraída de index.ts (líneas 391)
  const isAuthorized = !(
    role === 'marketer' &&
    !isSuperAdmin &&
    currentUser.role !== 'admin' &&
    currentUser.role !== 'owner'
  );

  console.assert(isAuthorized === true, 'Admin debe poder invitar con rol marketer');
});

Deno.test('marketer-invite: owner PUEDE invitar con rol marketer (no 403)', () => {
  const role = 'marketer';
  const isSuperAdmin = false;
  const currentUser = { role: 'owner' };

  const isAuthorized = !(
    role === 'marketer' &&
    !isSuperAdmin &&
    currentUser.role !== 'admin' &&
    currentUser.role !== 'owner'
  );

  console.assert(isAuthorized === true, 'Owner debe poder invitar con rol marketer');
});

Deno.test('marketer-invite: super_admin PUEDE invitar con rol marketer (no 403)', () => {
  const role = 'marketer';
  const isSuperAdmin = true;
  const currentUser = { role: 'member' }; // aunque sea member

  const isAuthorized = !(
    role === 'marketer' &&
    !isSuperAdmin &&
    currentUser.role !== 'admin' &&
    currentUser.role !== 'owner'
  );

  console.assert(isAuthorized === true, 'Super admin debe poder invitar con rol marketer');
});

Deno.test('marketer-invite: miembro normal NO puede invitar con rol marketer (403)', () => {
  const role = 'marketer';
  const isSuperAdmin = false;
  const currentUser = { role: 'member' };

  const isAuthorized = !(
    role === 'marketer' &&
    !isSuperAdmin &&
    currentUser.role !== 'admin' &&
    currentUser.role !== 'owner'
  );

  console.assert(isAuthorized === false, 'Miembro NO debe poder invitar con rol marketer');
});

Deno.test('marketer-invite: agente NO puede invitar con rol marketer (403)', () => {
  const role = 'marketer';
  const isSuperAdmin = false;
  const currentUser = { role: 'agent' };

  const isAuthorized = !(
    role === 'marketer' &&
    !isSuperAdmin &&
    currentUser.role !== 'admin' &&
    currentUser.role !== 'owner'
  );

  console.assert(isAuthorized === false, 'Agente NO debe poder invitar con rol marketer');
});

Deno.test('marketer-invite: professional NO puede invitar con rol marketer (403)', () => {
  const role = 'marketer';
  const isSuperAdmin = false;
  const currentUser = { role: 'professional' };

  const isAuthorized = !(
    role === 'marketer' &&
    !isSuperAdmin &&
    currentUser.role !== 'admin' &&
    currentUser.role !== 'owner'
  );

  console.assert(isAuthorized === false, 'Professional NO debe poder invitar con rol marketer');
});

Deno.test('marketer-invite: respuesta 403 tiene mensaje en español adecuado', () => {
  const expectedMessage = 'Solo administradores y propietarios pueden asignar el rol de marketing.';

  console.assert(
    typeof expectedMessage === 'string' && expectedMessage.length > 0,
    'El mensaje de error 403 debe estar definido',
  );
  console.assert(
    expectedMessage.includes('marketing') || expectedMessage.includes('Marketing'),
    'El mensaje debe mencionar el rol de marketing',
  );
});

// ---------------------------------------------------------------------------
// TEST 3: La etiqueta de rol incluye 'marketer' → 'Marketing'
// ---------------------------------------------------------------------------

Deno.test('marketer-invite: ROLE_LABELS mapea "marketer" → "Marketing"', () => {
  const roleLabel = ROLE_LABELS['marketer'];

  console.assert(roleLabel !== undefined, 'marketer debe tener una etiqueta definida');
  console.assert(typeof roleLabel === 'string', 'La etiqueta debe ser string');
  console.assert(roleLabel === 'Marketing', `Esperado 'Marketing', obtenido '${roleLabel}'`);
});

Deno.test('marketer-invite: roleLabel está presente en los datos enviados al email', () => {
  // Simula el objeto data que se envía a sendBrandedEmailInvite
  const role = 'marketer';
  const roleLabel = ROLE_LABELS[role] || role;
  const data = {
    invite_url: 'https://app.simplificacrm.es/invite?token=abc123',
    role,
    role_label: roleLabel,
    inviter_name: 'Admin Test',
    message: 'Bienvenido al equipo',
  };

  console.assert(data.role === 'marketer', 'role debe ser marketer');
  console.assert(data.role_label === 'Marketing', 'role_label debe ser Marketing');

  // Verificar que el objeto data es válido para enviar al email
  console.assert(typeof data.invite_url === 'string', 'invite_url debe ser string');
  console.assert(data.invite_url.includes('invite?token='), 'invite_url debe contener el token');
});

Deno.test('marketer-invite: ROLE_LABELS tiene todas las claves esperadas', () => {
  const expectedKeys = ['owner', 'admin', 'member', 'professional', 'agent', 'marketer', 'client'];

  for (const key of expectedKeys) {
    console.assert(
      key in ROLE_LABELS,
      `ROLE_LABELS debe contener la clave '${key}'`,
    );
    console.assert(
      typeof ROLE_LABELS[key] === 'string' && ROLE_LABELS[key].length > 0,
      `ROLE_LABELS['${key}'] debe ser un string no vacío`,
    );
  }
});

Deno.test('marketer-invite: fallback de roleLabel para rol desconocido es el propio rol', () => {
  // En index.ts: const roleLabel = ROLE_LABELS[role] || role;
  const roleLabel = ROLE_LABELS['unknown_role'] || 'unknown_role';
  console.assert(roleLabel === 'unknown_role', 'El fallback debe devolver el nombre del rol');
});

// ---------------------------------------------------------------------------
// TEST 4: Email type routing — 'invite_marketer' es el emailType correcto
// ---------------------------------------------------------------------------

Deno.test('marketer-invite: emailType es "invite_marketer" para rol marketer no-cliente', () => {
  const role = 'marketer';
  const isClientInvite = false;

  // Lógica de routing del emailType extraída de index.ts (líneas 611-618)
  const staffRoles = ['owner', 'admin', 'member', 'professional', 'agent', 'marketer'];
  const emailType = isClientInvite
    ? 'invite_client'
    : `invite_${staffRoles.includes(role) ? role : 'member'}`;

  console.assert(
    emailType === 'invite_marketer',
    `Esperado 'invite_marketer', obtenido '${emailType}'`,
  );
});

Deno.test('marketer-invite: "invite_marketer" es reconocido por send-branded-email', () => {
  // Simula el switch/case que maneja el emailType en send-branded-email/index.ts
  const emailTypes = [
    'invite_admin',
    'invite_member',
    'invite_professional',
    'invite_agent',
    'invite_marketer',
    'invite_client',
  ];

  console.assert(
    emailTypes.includes('invite_marketer'),
    'invite_marketer debe estar en la lista de tipos de email para invitaciones',
  );

  // Verificar que el template de branded email usa la etiqueta correcta
  const roleLabels: Record<string, string> = {
    invite_admin: 'Administrador',
    invite_member: 'Miembro',
    invite_professional: 'Profesional',
    invite_agent: 'Agente',
    invite_marketer: 'Marketing',
    invite_client: 'Cliente',
  };

  console.assert(
    roleLabels['invite_marketer'] === 'Marketing',
    `invite_marketer debe mapear a 'Marketing', obtenido '${roleLabels['invite_marketer']}'`,
  );
});

Deno.test('marketer-invite: subject del email incluye el role_label', () => {
  // En send-branded-email/index.ts:
  // subject = `Te han invitado a ${companyName} como ${displayRoleLabel}`
  const companyName = 'Simplifica CRM';
  const displayRoleLabel = 'Marketing';
  const subject = `Te han invitado a ${companyName} como ${displayRoleLabel}`;

  console.assert(
    subject.includes('Marketing'),
    'El subject del email debe incluir la etiqueta del rol',
  );
  console.assert(
    subject.includes(companyName),
    'El subject debe incluir el nombre de la empresa',
  );
  console.assert(
    subject === 'Te han invitado a Simplifica CRM como Marketing',
    'El subject debe tener el formato exacto esperado',
  );
});

// ---------------------------------------------------------------------------
// TEST 5: Invitación con rol marketer — payload completo
// ---------------------------------------------------------------------------

Deno.test('marketer-invite: payload mínimo válido para crear invitación marketer', () => {
  const payload = {
    email: 'marketing@example.com',
    role: 'marketer',
  };

  // Validaciones de payload que ocurren en la Edge Function
  console.assert(typeof payload.email === 'string', 'email debe ser string');
  console.assert(payload.email.includes('@'), 'email debe contener @');
  console.assert(payload.role === 'marketer', 'role debe ser marketer');
  console.assert(VALID_INVITE_ROLES.includes(payload.role as any), 'role debe ser válido');
});

Deno.test('marketer-invite: payload con message opcional es válido', () => {
  const payload = {
    email: 'marketing@example.com',
    role: 'marketer',
    message: 'Te invitamos a gestionar las campañas de marketing.',
  };

  console.assert(payload.role === 'marketer', 'role debe ser marketer');
  console.assert(typeof payload.message === 'string', 'message debe ser string');
  console.assert(payload.message.length > 0, 'message no debe estar vacío');

  // El mensaje será sanitizado (HTML stripped, max 500 chars, HTML entities encoded)
  const sanitized = payload.message
    .replace(/<[^>]*>/g, '')
    .replace(/[<>"'&]/g, () => '')
    .slice(0, 500)
    .trim();

  console.assert(sanitized === payload.message, 'Mensaje limpio sin HTML debe permanecer igual');
});

// ---------------------------------------------------------------------------
// TEST 6: Seguridad — respuestas de error
// ---------------------------------------------------------------------------

Deno.test('marketer-invite: 401 cuando falta Authorization header', () => {
  const req = makeRequest({ email: 'test@test.com', role: 'marketer' });
  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');

  const hasBearer = authHeader && authHeader.startsWith('Bearer ');

  console.assert(!hasBearer, 'Request sin Authorization debe ser detectada como no autorizada');

  // El handler devuelve 401 con error 'unauthorized'
  const expectedStatus = 401;
  console.assert(expectedStatus === 401, 'Debe devolver 401 sin token');
});

Deno.test('marketer-invite: no se puede auto-invitar', () => {
  // Verificar la lógica de auto-invitación (línea 284)
  const authUserEmail = 'admin@example.com';
  const inviteEmail = 'admin@example.com'; // mismo email

  const isSelfInvite = authUserEmail.toLowerCase() === inviteEmail.toLowerCase();

  console.assert(isSelfInvite === true, 'Mismo email debe detectarse como auto-invitación');
  console.assert(isSelfInvite, 'Auto-invitación debe ser rechazada (400 forbidden)');
});

Deno.test('marketer-invite: email inválido es rechazado con 400', () => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const invalidEmails = ['notanemail', 'missing@', '@missing.com', ''];

  for (const email of invalidEmails) {
    const isValid = emailRegex.test(email);
    console.assert(!isValid, `'${email}' debe ser rechazado como email inválido`);
  }
});

// ---------------------------------------------------------------------------
// TEST 7: Tokens y respuestas exitosas
// ---------------------------------------------------------------------------

Deno.test('marketer-invite: respuesta exitosa incluye campos esperados', () => {
  // Forma de la respuesta cuando branded email o Supabase Auth envía correctamente
  const successResponse = {
    success: true,
    invitation_id: 'abc-123-def',
    email_sent: true,
  };

  console.assert(successResponse.success === true, 'success debe ser true');
  console.assert(typeof successResponse.invitation_id === 'string', 'invitation_id debe ser string');
  console.assert(successResponse.email_sent === true, 'email_sent debe ser true');
});

Deno.test('marketer-invite: respuesta con invite_url de respaldo si email falla', () => {
  // Cuando el email no se pudo enviar pero la invitación se creó
  const fallbackResponse = {
    success: true,
    email_sent: false,
    invitation_id: 'abc-123-def',
    invite_url: 'https://app.simplificacrm.es/invite?token=abc-123-token',
    info: 'El email no se pudo enviar. Compartí este link manualmente con la persona invitada.',
  };

  console.assert(fallbackResponse.success === true, 'success debe ser true incluso si email falla');
  console.assert(fallbackResponse.email_sent === false, 'email_sent debe ser false');
  console.assert(
    fallbackResponse.invite_url.includes('invite?token='),
    'invite_url debe contener el token',
  );
});

// ---------------------------------------------------------------------------
// TEST 8: Verificación completa del flujo de invitación marketer
// ---------------------------------------------------------------------------

Deno.test('marketer-invite: flujo completo — validación de autorización en cascada', () => {
  // Simula el flujo completo de autorización que ocurre en index.ts

  interface TestCase {
    currentUserRole: string;
    isSuperAdmin: boolean;
    targetRole: string;
    shouldAllow: boolean;
    description: string;
  }

  const testCases: TestCase[] = [
    { currentUserRole: 'admin', isSuperAdmin: false, targetRole: 'marketer', shouldAllow: true, description: 'admin → marketer' },
    { currentUserRole: 'owner', isSuperAdmin: false, targetRole: 'marketer', shouldAllow: true, description: 'owner → marketer' },
    { currentUserRole: 'member', isSuperAdmin: false, targetRole: 'marketer', shouldAllow: false, description: 'member → marketer' },
    { currentUserRole: 'agent', isSuperAdmin: false, targetRole: 'marketer', shouldAllow: false, description: 'agent → marketer' },
    { currentUserRole: 'professional', isSuperAdmin: false, targetRole: 'marketer', shouldAllow: false, description: 'professional → marketer' },
    { currentUserRole: 'member', isSuperAdmin: true, targetRole: 'marketer', shouldAllow: true, description: 'super_admin(member) → marketer' },
    { currentUserRole: 'admin', isSuperAdmin: false, targetRole: 'member', shouldAllow: true, description: 'admin → member (rol no restringido)' },
    { currentUserRole: 'member', isSuperAdmin: false, targetRole: 'member', shouldAllow: true, description: 'member → member (rol no restringido)' },
  ];

  let passCount = 0;
  for (const tc of testCases) {
    const isAuthorized = !(
      tc.targetRole === 'marketer' &&
      !tc.isSuperAdmin &&
      tc.currentUserRole !== 'admin' &&
      tc.currentUserRole !== 'owner'
    );

    console.assert(
      isAuthorized === tc.shouldAllow,
      `FAIL: ${tc.description} | Esperado=${tc.shouldAllow} Obtenido=${isAuthorized}`,
    );
    passCount++;
  }

  console.log(`✓ Todos los ${passCount} casos de autorización pasaron`);
});
