-- Structured package line items for logistics/commercial grounding (V3 data foundation).
-- Application normalizes to a strict union in TS; DB stores unconstrained text[] for forward compatibility.

ALTER TABLE public.weddings
ADD COLUMN IF NOT EXISTS package_inclusions text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN public.weddings.package_inclusions IS
  'Contract package inclusion tokens (e.g. second_shooter). App layer filters to PackageInclusionItem.';
