"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

interface Order {
  id: string;
  order_id: string;
  created_at: string;
  service_name: string;
  country_name: string;
  service: string;
  country: string;
  phone_number: string;
  status: string;
  cost: number;
}

interface Message {
  sms_code: string;
  full_text: string;
}

export default function HistoryPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, Message | null>>({});

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("orders")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100);

      if (data) setOrders(data as Order[]);
      setLoading(false);
    };
    load();
  }, []);

  const toggleRow = async (order: Order) => {
    if (expandedId === order.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(order.id);

    // Fetch message if we haven't already
    if (messages[order.id] === undefined) {
      const supabase = createClient();
      const { data } = await supabase
        .from("messages")
        .select("sms_code, full_text")
        .eq("order_id", order.order_id)
        .limit(1)
        .single();
      setMessages((prev) => ({ ...prev, [order.id]: data as Message | null }));
    }
  };

  const statusBadge = (status: string) => {
    const map: Record<string, { bg: string; color: string; border: string }> = {
      pending: { bg: "#1A1500", color: "#F5A623", border: "#F5A623" },
      active: { bg: "#0A1F0A", color: "#00FF94", border: "#00FF94" },
      completed: { bg: "#0A1F0A", color: "#00FF94", border: "#00FF94" },
      cancelled: { bg: "#1A0000", color: "#FF4444", border: "#FF4444" },
      expired: { bg: "#1A1A1A", color: "#555555", border: "#555555" },
      refunded: { bg: "#1A1500", color: "#F5A623", border: "#F5A623" },
    };
    const s = map[status] || map.expired;
    return (
      <span
        className="inline-block px-2 py-0.5 rounded text-[11px] font-mono font-medium"
        style={{
          backgroundColor: s.bg,
          color: s.color,
          border: `1px solid ${s.border}`,
        }}
      >
        {status}
      </span>
    );
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6" style={{ color: "#F5F5F5" }}>
        Order history
      </h1>

      {loading ? (
        <div className="flex justify-center py-16">
          <span
            className="auth-spinner"
            style={{
              width: 24,
              height: 24,
              borderColor: "#00FF94",
              borderTopColor: "transparent",
            }}
          />
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-sm mb-2" style={{ color: "#555555" }}>
            No orders yet.
          </p>
          <Link
            href="/dashboard"
            className="text-sm font-medium hover:underline"
            style={{ color: "#00FF94" }}
          >
            Get your first number &rarr;
          </Link>
        </div>
      ) : (
        <div
          className="rounded-xl overflow-hidden"
          style={{ border: "1px solid #1A1A1A" }}
        >
          <table className="w-full text-[13px]">
            <thead>
              <tr style={{ backgroundColor: "#0F0F0F" }}>
                <th
                  className="text-left py-3 px-4 font-medium"
                  style={{ color: "#555555" }}
                >
                  Date
                </th>
                <th
                  className="text-left py-3 px-4 font-medium"
                  style={{ color: "#555555" }}
                >
                  Service
                </th>
                <th
                  className="text-left py-3 px-4 font-medium hidden sm:table-cell"
                  style={{ color: "#555555" }}
                >
                  Country
                </th>
                <th
                  className="text-left py-3 px-4 font-medium hidden md:table-cell"
                  style={{ color: "#555555" }}
                >
                  Number
                </th>
                <th
                  className="text-left py-3 px-4 font-medium"
                  style={{ color: "#555555" }}
                >
                  Status
                </th>
                <th
                  className="text-right py-3 px-4 font-medium"
                  style={{ color: "#555555" }}
                >
                  Cost
                </th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td colSpan={6} className="p-0">
                    <button
                      onClick={() => toggleRow(order)}
                      className="w-full text-left hover:bg-[#0F0F0F] transition-colors"
                      style={{ borderTop: "1px solid #1A1A1A" }}
                    >
                      <div className="grid grid-cols-[1fr_1fr_auto_auto] sm:grid-cols-[1fr_1fr_1fr_auto_auto_auto] md:grid-cols-[1fr_1fr_1fr_1fr_auto_auto] items-center">
                        <span
                          className="py-3 px-4 font-mono"
                          style={{ color: "#F5F5F5" }}
                        >
                          {formatDate(order.created_at)}
                        </span>
                        <span
                          className="py-3 px-4"
                          style={{ color: "#F5F5F5" }}
                        >
                          {order.service_name || order.service}
                        </span>
                        <span
                          className="py-3 px-4 hidden sm:block"
                          style={{ color: "#F5F5F5" }}
                        >
                          {order.country_name || order.country}
                        </span>
                        <span
                          className="py-3 px-4 font-mono hidden md:block"
                          style={{ color: "#F5F5F5" }}
                        >
                          {order.phone_number}
                        </span>
                        <span className="py-3 px-4">
                          {statusBadge(order.status)}
                        </span>
                        <span
                          className="py-3 px-4 text-right font-mono"
                          style={{ color: "#00FF94" }}
                        >
                          ${order.cost.toFixed(2)}
                        </span>
                      </div>
                    </button>

                    {/* Expanded row — SMS details */}
                    {expandedId === order.id && (
                      <div
                        className="px-4 pb-4 pt-1"
                        style={{ backgroundColor: "#0A0A0A" }}
                      >
                        {messages[order.id] === undefined ? (
                          <div className="flex items-center gap-2 py-2">
                            <span
                              className="auth-spinner"
                              style={{
                                borderColor: "#00FF94",
                                borderTopColor: "transparent",
                              }}
                            />
                            <span
                              className="text-xs"
                              style={{ color: "#555555" }}
                            >
                              Loading...
                            </span>
                          </div>
                        ) : messages[order.id] === null ? (
                          <p
                            className="text-xs py-2"
                            style={{ color: "#555555" }}
                          >
                            No SMS received for this order
                          </p>
                        ) : (
                          <div
                            className="rounded-lg p-3"
                            style={{
                              backgroundColor: "#0F0F0F",
                              border: "1px solid #1A1A1A",
                            }}
                          >
                            <p
                              className="text-xs mb-1"
                              style={{ color: "#555555" }}
                            >
                              Received code
                            </p>
                            <p
                              className="font-mono text-2xl font-bold"
                              style={{ color: "#00FF94" }}
                            >
                              {messages[order.id]!.sms_code}
                            </p>
                            {messages[order.id]!.full_text && (
                              <p
                                className="text-xs mt-2"
                                style={{ color: "#555555" }}
                              >
                                {messages[order.id]!.full_text}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
