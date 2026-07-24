"use client";

import { useState } from "react";
import Image from "next/image";
import { Menu } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { Role } from "@/lib/rbac/roles";

import { SidebarNav } from "./sidebar-nav";

export function MobileNav({ role }: { role: Role }) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="size-5" />
          <span className="sr-only">Open menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 border-none bg-primary p-0 text-white">
        <SheetHeader className="flex-row items-center gap-2.5 border-b border-white/12 py-5">
          <Image
            src="/pamp-logo.jpeg"
            alt="PAM-P"
            width={32}
            height={32}
            className="size-8 shrink-0 rounded-full object-cover"
          />
          <SheetTitle className="text-white">EFMS</SheetTitle>
        </SheetHeader>
        <div className="py-3.5">
          <SidebarNav role={role} onNavigate={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
