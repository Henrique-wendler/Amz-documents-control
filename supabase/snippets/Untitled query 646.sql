select
  factor_type,
  status,
  friendly_name,
  created_at,
  updated_at
from auth.mfa_factors
where user_id = (
  select id
  from auth.users
  where email = 'admin@teste.local'
);