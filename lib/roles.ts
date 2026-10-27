// Every role belongs to one section of the club. Edit these lists to match the roles you use.
export const SECTIONS = [
  { id: "foh", name: "Front of house", roles: ["Server", "Host", "Food runner", "Busser", "Banquet server"] },
  { id: "boh", name: "Back of house", roles: ["Line cook", "Prep cook", "Pastry cook", "Dishwasher"] },
  { id: "bar", name: "Bar", roles: ["Bartender", "Barback"] },
  { id: "mgr", name: "Manager", roles: ["Manager", "Supervisor"] },
] as const;

export const ROLES: string[] = SECTIONS.flatMap((s) => [...s.roles]);

export function sectionOf(role: string) {
  return SECTIONS.find((s) => (s.roles as readonly string[]).includes(role)) ?? SECTIONS[0];
}

export function isRole(role: string) {
  return ROLES.includes(role);
}
