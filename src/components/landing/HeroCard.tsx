"use client";

import { useState, useEffect, useRef } from "react";

export default function HeroCard() {
  const [seconds, setSeconds] = useState(19 * 60); // 19:00
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setSeconds((prev) => {
        if (prev <= 0) return 19 * 60; // reset
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const timeStr = `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;

  return (
    <div className="w-full max-w-md">
      <div
        className="bg-[#0F0F0F] border border-[#1A1A1A] rounded-lg overflow-hidden border-t-[#00FF94]"
        style={{ borderTopColor: "#00FF94" }}
      >
        <div className="p-6">
          {/* Header row */}
          <div className="flex items-center justify-between mb-6">
            <span className="font-mono text-[#555555] text-xs tracking-wider uppercase">
              Active Session
            </span>
            <span className="font-mono text-[#555555] text-xs">#28491</span>
          </div>

          {/* Data rows */}
          <div className="space-y-3 font-mono text-sm">
            <div className="flex justify-between">
              <span className="text-[#555555]">service</span>
              <span className="text-[#F5F5F5]">google</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#555555]">country</span>
              <span className="text-[#F5F5F5]">united states</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#555555]">number</span>
              <span className="text-[#F5F5F5]">+1 (415) 555-0182</span>
            </div>

            {/* Divider */}
            <div className="border-t border-[#1A1A1A]" />

            <div className="flex justify-between items-center">
              <span className="text-[#555555]">status</span>
              <span className="flex items-center gap-2 text-[#00FF94]">
                <span className="status-dot inline-block w-2 h-2 rounded-full bg-[#00FF94]" />
                waiting for sms...
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#555555]">expires</span>
              <span className="text-[#F5F5F5]">{timeStr}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
