export const formatDate = (dateString: any) => {
  return new Date(dateString).toLocaleString();
};

export const getMenuItemDepartment = (menuItem: any): string | null => {

  const explicitMain = String(menuItem?.main_category || "")
    .trim()
    .toLowerCase();

    return explicitMain;
};
