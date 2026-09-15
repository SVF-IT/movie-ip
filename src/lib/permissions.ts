import type { UserRole } from "@/lib/types/database";

export type Action = "create" | "edit" | "delete" | "import" | "export";
export type Resource =
  | "movie"
  | "platform"
  | "production_house"
  | "person"
  | "right"
  | "agreement"
  | "user"
  | "report"
  | "censor_certificate"
  | "barc";

/**
 * RBAC matrix:
 * - admin: full access to everything
 * - super_admin: mirrors admin exactly for now; its distinct view and limitations are TBD
 * - data_analyst: same as editor, plus BARC access
 * - legal: full CRUD on movies, rights & agreements (applied directly, no approval); create/edit platforms & production houses; full CRUD people; export/reports
 * - editor: create/edit/delete/import movies (via approval workflow); full CRUD rights (via approval); create/edit platforms & production houses; full CRUD people; export/reports
 * - viewer: read-only everywhere
 *
 * BARC is deliberately restricted to admin, super_admin and data_analyst — the data is
 * licensed, so editor/legal/viewer get no `barc` entry at all.
 */
const permissionMatrix: Record<
  UserRole,
  Partial<Record<Resource, Action[]>>
> = {
  admin: {
    movie: ["create", "edit", "delete", "import", "export"],
    platform: ["create", "edit", "delete", "import", "export"],
    production_house: ["create", "edit", "delete", "import", "export"],
    person: ["create", "edit", "delete", "import", "export"],
    right: ["create", "edit", "delete", "import", "export"],
    agreement: ["create", "edit", "delete", "import", "export"],
    user: ["create", "edit", "delete"],
    report: ["create", "edit", "delete", "export"],
    censor_certificate: ["create", "edit", "delete", "export"],
    barc: ["create", "edit", "delete", "import", "export"],
  },
  super_admin: {
    movie: ["create", "edit", "delete", "import", "export"],
    platform: ["create", "edit", "delete", "import", "export"],
    production_house: ["create", "edit", "delete", "import", "export"],
    person: ["create", "edit", "delete", "import", "export"],
    right: ["create", "edit", "delete", "import", "export"],
    agreement: ["create", "edit", "delete", "import", "export"],
    user: ["create", "edit", "delete"],
    report: ["create", "edit", "delete", "export"],
    censor_certificate: ["create", "edit", "delete", "export"],
    barc: ["create", "edit", "delete", "import", "export"],
  },
  data_analyst: {
    movie: ["create", "edit", "delete", "import", "export"],
    platform: ["create", "edit", "export"],
    production_house: ["create", "edit", "export"],
    person: ["create", "edit", "delete", "import", "export"],
    right: ["create", "edit", "delete", "import", "export"],
    agreement: ["create", "edit", "delete", "import", "export"],
    report: ["create", "edit", "export"],
    censor_certificate: ["create", "edit", "delete", "export"],
    barc: ["create", "edit", "delete", "import", "export"],
  },
  editor: {
    movie: ["create", "edit", "delete", "import", "export"],
    platform: ["create", "edit", "export"],
    production_house: ["create", "edit", "export"],
    person: ["create", "edit", "delete", "import", "export"],
    right: ["create", "edit", "delete", "import", "export"],
    agreement: ["create", "edit", "delete", "import", "export"],
    report: ["create", "edit", "export"],
    censor_certificate: ["create", "edit", "delete", "export"],
  },
  legal: {
    movie: ["create", "edit", "delete", "import", "export"],
    platform: ["create", "edit", "export"],
    production_house: ["create", "edit", "export"],
    person: ["create", "edit", "delete", "import", "export"],
    right: ["create", "edit", "delete", "import", "export"],
    agreement: ["create", "edit", "delete", "import", "export"],
    report: ["create", "edit", "export"],
    censor_certificate: ["create", "edit", "delete", "export"],
  },
  viewer: {
    movie: ["export"],
    platform: ["export"],
    production_house: ["export"],
    person: ["export"],
    right: ["export"],
    agreement: ["export"],
    report: ["export"],
    censor_certificate: ["export"],
  },
};

export function canPerform(
  role: UserRole | undefined,
  action: Action,
  resource: Resource
): boolean {
  if (!role) return false;
  const allowed = permissionMatrix[role]?.[resource];
  return allowed ? allowed.includes(action) : false;
}
