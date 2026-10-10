import React from 'react';
import { Plus } from 'lucide-react';
import PageHeader from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { LocationStats } from './components/LocationStats';
import { LocationsTable } from './components/LocationsTable';
import { LocationFormDialog } from './components/LocationFormDialog';
import OfflineBanner from '@/components/OfflineBanner';
import useStockLocationData from './hooks/useStockLocationData';

export const StockLocationManagement: React.FC = () => {
  const {
    loading,
    locations,
    mainCategories,
    dialogOpen,
    setDialogOpen,
    selectedLocation,
    formData,
    setFormData,
    saving,
    openAdd,
    openEdit,
    handleSubmit,
    handleDeactivate,
    syncStatus,
  } = useStockLocationData();

  return (
    <div className="p-4 md:p-8 space-y-6">
      <PageHeader
        title="Stock places"
        description="Where you keep stock: kitchen, barista, freezer and more."
        actions={
          <div className="flex items-center gap-2">
            <Button onClick={openAdd} disabled={!syncStatus.online}>
              <Plus />
              Add stock place
            </Button>
          </div>
        }
      />

      <OfflineBanner online={syncStatus.online} />

      <LocationStats locations={locations} />

      <LocationsTable
        loading={loading}
        locations={locations}
        onEdit={openEdit}
        onDeactivate={handleDeactivate}
      />

      <LocationFormDialog
        dialogOpen={dialogOpen}
        setDialogOpen={setDialogOpen}
        selectedLocation={selectedLocation}
        formData={formData}
        setFormData={setFormData}
        mainCategories={mainCategories}
        saving={saving}
        onSubmit={handleSubmit}
      />
    </div>
  );
};

export default StockLocationManagement;
