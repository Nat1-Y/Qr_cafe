import { CustomerApp } from "@/components/customer/CustomerApp";

export default async function GuestOrderPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <CustomerApp token={token} />;
}
