export type OnboardingFieldMode = 'hidden' | 'optional' | 'required';
export type OnboardingScope = 'user' | 'client' | 'company';

export type UserOnboardingFieldKey = 'name' | 'surname';
export type ClientOnboardingFieldKey =
  | 'phone'
  | 'dni'
  | 'billing_email'
  | 'website'
  | 'business_name'
  | 'trade_name';
export type CompanyOnboardingFieldKey = 'company_name' | 'company_nif';

export interface OnboardingPolicy {
  version: 1;
  user: Record<UserOnboardingFieldKey, OnboardingFieldMode>;
  client: Record<ClientOnboardingFieldKey, OnboardingFieldMode>;
  company: Record<CompanyOnboardingFieldKey, OnboardingFieldMode>;
}

export interface OnboardingSubmissionData {
  user: Partial<Record<UserOnboardingFieldKey, string>>;
  client: Partial<Record<ClientOnboardingFieldKey, string>>;
  company: Partial<Record<CompanyOnboardingFieldKey, string>>;
}

export interface OnboardingFieldDefinition<TField extends string = string> {
  key: TField;
  scope: OnboardingScope;
  label: string;
  description?: string;
  placeholder?: string;
  inputType?: 'text' | 'email' | 'tel' | 'url';
  autocomplete?: string;
}

const defaultPolicy: OnboardingPolicy = {
  version: 1,
  user: {
    name: 'required',
    surname: 'optional',
  },
  client: {
    phone: 'hidden',
    dni: 'hidden',
    billing_email: 'hidden',
    website: 'hidden',
    business_name: 'hidden',
    trade_name: 'hidden',
  },
  company: {
    company_name: 'required',
    company_nif: 'optional',
  },
};

const userFieldKeys: UserOnboardingFieldKey[] = ['name', 'surname'];
const clientFieldKeys: ClientOnboardingFieldKey[] = [
  'phone',
  'dni',
  'billing_email',
  'website',
  'business_name',
  'trade_name',
];
const companyFieldKeys: CompanyOnboardingFieldKey[] = ['company_name', 'company_nif'];

const validModes = new Set<OnboardingFieldMode>(['hidden', 'optional', 'required']);

function normalizeSection<TField extends string>(
  defaults: Record<TField, OnboardingFieldMode>,
  rawSection: unknown,
  keys: readonly TField[],
): Record<TField, OnboardingFieldMode> {
  const section = typeof rawSection === 'object' && rawSection !== null
    ? (rawSection as Record<string, unknown>)
    : {};

  return keys.reduce((accumulator, key) => {
    const rawMode = section[key];
    accumulator[key] = typeof rawMode === 'string' && validModes.has(rawMode as OnboardingFieldMode)
      ? (rawMode as OnboardingFieldMode)
      : defaults[key];
    return accumulator;
  }, {} as Record<TField, OnboardingFieldMode>);
}

export function getDefaultOnboardingPolicy(): OnboardingPolicy {
  return {
    version: 1,
    user: { ...defaultPolicy.user },
    client: { ...defaultPolicy.client },
    company: { ...defaultPolicy.company },
  };
}

export function normalizeOnboardingPolicy(rawPolicy: unknown): OnboardingPolicy {
  const raw = typeof rawPolicy === 'object' && rawPolicy !== null
    ? (rawPolicy as Record<string, unknown>)
    : {};

  return {
    version: 1,
    user: normalizeSection(defaultPolicy.user, raw['user'], userFieldKeys),
    client: normalizeSection(defaultPolicy.client, raw['client'], clientFieldKeys),
    company: normalizeSection(defaultPolicy.company, raw['company'], companyFieldKeys),
  };
}

export function mergeOnboardingPolicies(
  basePolicy?: unknown,
  overridePolicy?: unknown,
): OnboardingPolicy {
  const base = normalizeOnboardingPolicy(basePolicy);
  const override = normalizeOnboardingPolicy(overridePolicy);

  return {
    version: 1,
    user: { ...base.user, ...override.user },
    client: { ...base.client, ...override.client },
    company: { ...base.company, ...override.company },
  };
}

export const onboardingFieldDefinitions: OnboardingFieldDefinition[] = [
  {
    key: 'name',
    scope: 'user',
    label: 'Nombre',
    placeholder: 'Tu nombre',
    autocomplete: 'given-name',
  },
  {
    key: 'surname',
    scope: 'user',
    label: 'Apellidos',
    placeholder: 'Tus apellidos',
    autocomplete: 'family-name',
  },
  {
    key: 'phone',
    scope: 'client',
    label: 'Teléfono',
    placeholder: '+34 600 000 000',
    inputType: 'tel',
    autocomplete: 'tel',
  },
  {
    key: 'dni',
    scope: 'client',
    label: 'DNI / NIE',
    placeholder: '12345678A',
    autocomplete: 'off',
  },
  {
    key: 'billing_email',
    scope: 'client',
    label: 'Email de facturación',
    placeholder: 'facturacion@empresa.com',
    inputType: 'email',
    autocomplete: 'email',
  },
  {
    key: 'website',
    scope: 'client',
    label: 'Sitio web',
    placeholder: 'https://empresa.com',
    inputType: 'url',
    autocomplete: 'url',
  },
  {
    key: 'business_name',
    scope: 'client',
    label: 'Razón social',
    placeholder: 'Empresa S.L.',
    autocomplete: 'organization',
  },
  {
    key: 'trade_name',
    scope: 'client',
    label: 'Nombre comercial',
    placeholder: 'Marca visible al cliente',
    autocomplete: 'organization',
  },
  {
    key: 'company_name',
    scope: 'company',
    label: 'Nombre de la empresa u organización',
    placeholder: 'Mi empresa',
    description: 'Se utilizará para crear o identificar la organización inicial.',
    autocomplete: 'organization',
  },
  {
    key: 'company_nif',
    scope: 'company',
    label: 'NIF / CIF de la empresa',
    placeholder: 'B12345678',
    autocomplete: 'off',
  },
];

export function getOnboardingFieldDefinition(fieldKey: string): OnboardingFieldDefinition | undefined {
  return onboardingFieldDefinitions.find((field) => field.key === fieldKey);
}

function normalizeSubmissionSection<TField extends string>(
  rawSection: unknown,
  keys: readonly TField[],
): Partial<Record<TField, string>> {
  const section = typeof rawSection === 'object' && rawSection !== null
    ? (rawSection as Record<string, unknown>)
    : {};

  return keys.reduce((accumulator, key) => {
    const rawValue = section[key];
    if (typeof rawValue === 'string') {
      const normalizedValue = rawValue.trim();
      if (normalizedValue) {
        accumulator[key] = normalizedValue;
      }
    }
    return accumulator;
  }, {} as Partial<Record<TField, string>>);
}

export function normalizeOnboardingSubmissionData(rawData: unknown): OnboardingSubmissionData {
  const raw = typeof rawData === 'object' && rawData !== null
    ? (rawData as Record<string, unknown>)
    : {};

  return {
    user: normalizeSubmissionSection(raw['user'], userFieldKeys),
    client: normalizeSubmissionSection(raw['client'], clientFieldKeys),
    company: normalizeSubmissionSection(raw['company'], companyFieldKeys),
  };
}