export const getRoleColors = (role: string) => {
  const colors: Record<string, string> = {
    cashier: "bg-highlight hover:bg-highlight/80 text-highlight-foreground",
    admin: "bg-primary hover:bg-primary-hover text-primary-foreground",
  };
  return colors[role] || "bg-muted hover:bg-muted/80 text-foreground";
};

export const getRoleLabel = (role: string) => {
  const labels: Record<string, string> = {
    cashier: "Cashier",
    admin: "Manager",
  };
  return labels[role] || "Staff";
};

export const getUserInitials = (fullName: string) => {
  return fullName
    .split(" ")
    .map((name) => name.charAt(0))
    .join("")
    .toUpperCase()
    .slice(0, 2);
};

export const sanitizePin = (value: string) => {
  return value.replace(/\D/g, "").slice(0, 4);
};
