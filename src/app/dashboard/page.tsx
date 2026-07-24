"use client";

import { useState, useCallback, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/useUser";
import OrderForm from "@/components/dashboard/OrderForm";
import ActiveOrder from "@/components/dashboard/ActiveOrder";

interface Order {
  order_id: string;
  service: string;
  country: string;
  number: string;
  cost: number;
  expires_at: string;
  status: string;
}

export default function DashboardPage() {
  const user = useUser();
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [balance, setBalance] = useState(0);

  const fetchBalance = useCallback(async () => {
    if (!user) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("profiles")
      .select("balance")
      .eq("id", user.id)
      .single();
    if (data) setBalance(data.balance);
  }, [user]);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  const handleOrder = useCallback(
    (order: {
      order_id: string;
      phone_number: string;
      service_name: string;
      country_name: string;
      cost: number;
      expires_at: string;
    }) => {
      setActiveOrder({
        order_id: order.order_id,
        service: order.service_name,
        country: order.country_name,
        number: order.phone_number,
        cost: order.cost,
        expires_at: order.expires_at,
        status: "active",
      });
      fetchBalance();
    },
    [fetchBalance],
  );

  const handleOrderComplete = useCallback(() => {
    // SMS received — keep order visible
  }, []);

  const handleOrderCancelled = useCallback(() => {
    setActiveOrder(null);
    fetchBalance(); // refresh balance after refund
  }, [fetchBalance]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6" style={{ color: "#F5F5F5" }}>
        GetAnyNumberOnline
      </h1>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <OrderForm onOrder={handleOrder} balance={balance} />
        </div>
        <div>
          <ActiveOrder
            order={activeOrder}
            onOrderComplete={handleOrderComplete}
            onOrderCancelled={handleOrderCancelled}
          />
        </div>
      </div>
    </div>
  );
}
