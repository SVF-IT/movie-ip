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
  | "report";

/**
 * RBAC matrix:
 * - admin: full access to everything
 * - legal: full CRUD on movies, rights & agreements (applied directly, no approval); create/edit platforms & production houses; full CRUD people; export/reports
 * - editor: create/edit/delete/import movies (via approval workflow); full CRUD rights (via approval); create/edit platforms & production houses; full CRUD people; export/reports
 * - viewer: read-only everywhere
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
  },
  editor: {
    movie: ["create", "edit", "delete", "import", "export"],
    platform: ["create", "edit", "export"],
    production_house: ["create", "edit", "export"],
    person: ["create", "edit", "delete", "import", "export"],
    right: ["create", "edit", "delete", "import", "export"],
    agreement: ["create", "edit", "delete", "import", "export"],
    report: ["create", "edit", "export"],
  },
  legal: {
    movie: ["create", "edit", "delete", "import", "export"],
    platform: ["create", "edit", "export"],
    production_house: ["create", "edit", "export"],
    person: ["create", "edit", "delete", "import", "export"],
    right: ["create", "edit", "delete", "import", "export"],
    agreement: ["create", "edit", "delete", "import", "export"],
    report: ["create", "edit", "export"],
  },
  viewer: {},
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
