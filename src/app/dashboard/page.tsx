"use client";

import { useState, useCallback, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
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
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [balance, setBalance] = useState(0);

  useEffect(() => {
    const fetchBalance = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("balance")
        .eq("id", user.id)
        .single();
      if (data) setBalance(data.balance);
    };
    fetchBalance();

    // Listen for balance refreshes from sidebar
    const orig = (window as unknown as { __refreshBalance?: () => void })
      .__refreshBalance;
    const wrapped = () => {
      if (orig) orig();
      fetchBalance();
    };
    (
      window as unknown as { __onBalanceRefresh?: () => void }
    ).__onBalanceRefresh = fetchBalance;

    return () => {
      delete (window as unknown as { __onBalanceRefresh?: () => void })
        .__onBalanceRefresh;
    };
  }, []);

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
      // Refresh local balance
      const supabase = createClient();
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (!user) return;
        supabase
          .from("profiles")
          .select("balance")
          .eq("id", user.id)
          .single()
          .then(({ data }) => {
            if (data) setBalance(data.balance);
          });
      });
    },
    [],
  );

  const handleOrderComplete = useCallback(() => {
    // SMS received — keep order visible
  }, []);

  const handleOrderCancelled = useCallback(() => {
    setActiveOrder(null);
    // Refresh balance after refund
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase
        .from("profiles")
        .select("balance")
        .eq("id", user.id)
        .single()
        .then(({ data }) => {
          if (data) setBalance(data.balance);
        });
    });
  }, []);

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
