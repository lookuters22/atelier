import type { CrmSnapshot, PackageInclusionItem } from "../../../../src/types/crmSnapshot.types.ts";

export { parsePackageInclusions, isPackageInclusionItem } from "../../../../src/types/crmSnapshot.types.ts";

/** Null-safe membership check on structured `package_inclusions` only (no notes / freeform). */
export function crmHasPackageInclusion(
  crmSnapshot: CrmSnapshot | undefined | null,
  item: PackageInclusionItem,
): boolean {
  const list = crmSnapshot?.package_inclusions ?? [];
  return list.includes(item);
}
