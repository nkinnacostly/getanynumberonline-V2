import UserDetailClient from "./UserDetailClient";

/**
 * One user's account. The admin gate lives in the /admin layout, so this only
 * has to unwrap the route param — dynamic params are Promises in Next 16.
 */
export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <UserDetailClient userId={id} />;
}
