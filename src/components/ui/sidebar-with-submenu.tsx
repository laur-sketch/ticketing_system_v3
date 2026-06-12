"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { CreditCard, Grid2X2, HelpCircle, Layers3, Puzzle, Settings, WalletCards } from "lucide-react";

type MenuItem = { name: string; href: string; icon?: ReactNode };

const menuIconClass = "h-5 w-5";

const Menu = ({ children, items }: { children: ReactNode; items: MenuItem[] }) => {
  const [isOpened, setIsOpened] = useState(false);

  return (
    <div>
      <button
        type="button"
        className="flex w-full items-center justify-between rounded-lg p-2 text-gray-600 duration-150 hover:bg-gray-50 active:bg-gray-100"
        onClick={() => setIsOpened((v) => !v)}
        aria-expanded={isOpened}
        aria-controls="submenu"
      >
        <div className="flex items-center gap-x-2">{children}</div>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`h-5 w-5 duration-150 ${isOpened ? "rotate-180" : ""}`}
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {isOpened ? (
        <ul id="submenu" className="mx-4 border-l px-2 text-sm font-medium">
          {items.map((item) => (
            <li key={item.name}>
              <a
                href={item.href}
                className="flex items-center gap-x-2 rounded-lg p-2 text-gray-600 duration-150 hover:bg-gray-50 active:bg-gray-100"
              >
                {item.icon ? <div className="text-gray-500">{item.icon}</div> : null}
                {item.name}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
};

const Sidebar = () => {
  const navigation: MenuItem[] = [
    { href: "#overview", name: "Overview", icon: <Layers3 className={menuIconClass} /> },
    { href: "#integration", name: "Integration", icon: <Puzzle className={menuIconClass} /> },
    { href: "#plans", name: "Plans", icon: <Grid2X2 className={menuIconClass} /> },
    { href: "#transactions", name: "Transactions", icon: <WalletCards className={menuIconClass} /> },
  ];

  const navsFooter: MenuItem[] = [
    { href: "#help", name: "Help", icon: <HelpCircle className={menuIconClass} /> },
    { href: "#settings", name: "Settings", icon: <Settings className={menuIconClass} /> },
  ];

  const nestedNav: MenuItem[] = [
    { name: "Cards", href: "#cards" },
    { name: "Checkouts", href: "#checkouts" },
    { name: "Payments", href: "#payments" },
    { name: "Get paid", href: "#get-paid" },
  ];

  const profileRef = useRef<HTMLButtonElement | null>(null);
  const [isProfileActive, setIsProfileActive] = useState(false);

  useEffect(() => {
    const handleProfile = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setIsProfileActive(false);
      }
    };
    document.addEventListener("click", handleProfile);
    return () => document.removeEventListener("click", handleProfile);
  }, []);

  return (
    <nav className="fixed left-0 top-0 h-full w-full space-y-8 border-r bg-white sm:w-80">
      <div className="flex h-full flex-col px-4">
        <div className="flex h-20 items-center pl-2">
          <div className="flex w-full items-center gap-x-4">
            <Image
              src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=96&h=96&q=80"
              width={40}
              height={40}
              unoptimized
              className="h-10 w-10 rounded-full object-cover"
              alt="User avatar"
            />
            <div>
              <span className="block text-sm font-semibold text-gray-700">Alivika Tony</span>
              <span className="mt-px block text-xs text-gray-600">Hobby Plan</span>
            </div>

            <div className="relative flex-1 text-right">
              <button
                ref={profileRef}
                type="button"
                className="rounded-md p-1.5 text-gray-500 hover:bg-gray-50 active:bg-gray-100"
                onClick={() => setIsProfileActive((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={isProfileActive}
                aria-controls="profile-menu"
              >
                <Settings className="h-5 w-5" aria-hidden="true" />
              </button>

              {isProfileActive ? (
                <div
                  id="profile-menu"
                  role="menu"
                  className="absolute right-0 top-12 z-10 w-64 rounded-lg border bg-white text-sm text-gray-600 shadow-md"
                >
                  <div className="p-2 text-left">
                    <span className="block p-2 text-gray-500/80">alivika@gmail.com</span>
                    <a
                      href="#add-account"
                      className="block w-full rounded-md p-2 text-left duration-150 hover:bg-gray-50 active:bg-gray-100"
                      role="menuitem"
                    >
                      Add another account
                    </a>

                    <select className="w-full cursor-pointer appearance-none rounded-md bg-transparent p-2 outline-none hover:bg-gray-50" defaultValue="">
                      <option value="" disabled hidden>
                        Theme
                      </option>
                      <option>Dark</option>
                      <option>Light</option>
                    </select>

                    <button className="block w-full rounded-md p-2 text-left duration-150 hover:bg-gray-50 active:bg-gray-100">
                      Logout
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="overflow-auto">
          <ul className="flex-1 text-sm font-medium">
            {navigation.map((item) => (
              <li key={item.name}>
                <a
                  href={item.href}
                  className="flex items-center gap-x-2 rounded-lg p-2 text-gray-600 duration-150 hover:bg-gray-50 active:bg-gray-100"
                >
                  <div className="text-gray-500">{item.icon}</div>
                  {item.name}
                </a>
              </li>
            ))}

            <li>
              <Menu items={nestedNav}>
                <CreditCard className="h-5 w-5 text-gray-500" />
                Billing
              </Menu>
            </li>
          </ul>

          <div className="mt-2 border-t pt-2">
            <ul className="text-sm font-medium">
              {navsFooter.map((item) => (
                <li key={item.name}>
                  <a
                    href={item.href}
                    className="flex items-center gap-x-2 rounded-lg p-2 text-gray-600 duration-150 hover:bg-gray-50 active:bg-gray-100"
                  >
                    <div className="text-gray-500">{item.icon}</div>
                    {item.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Sidebar;
