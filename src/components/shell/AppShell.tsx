"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { IconBell, IconLogout, IconMenu2, IconSearch, IconSparkles, IconUserCircle, IconLock } from "@tabler/icons-react";
import { useAuth } from "../AuthProvider";
import { ThemeToggle } from "../ThemeToggle";
import { Avatar, RoleBadge, Spinner } from "../ui";
import { AiChat } from "../ai/AiChat";
import { MENU, labelFor } from "./menu";
import { api } from "@/lib/client/api";
import { prettyDateTime } from "@/lib/shared/dates";
import type { AppNotification } from "@/lib/shared/types";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { me, loading, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!me) router.replace("/login");
    else if (me.mustChangePassword) router.replace("/change-password");
  }, [me, loading, router]);

  // Close the mobile sidebar after navigating.
  useEffect(() => {
    document.body.classList.remove("sidebar-open");
  }, [pathname]);

  // Remember the desktop mini-sidebar choice.
  useEffect(() => {
    try {
      if (localStorage.getItem("hcm-sidebar") === "mini") document.body.classList.add("sidebar-collapsed");
    } catch {}
  }, []);

  if (loading || !me || me.mustChangePassword) {
    return (
      <div className="splash">
        <Spinner />
      </div>
    );
  }

  const toggleSidebar = () => {
    if (window.innerWidth < 992) {
      document.body.classList.toggle("sidebar-open");
      return;
    }
    const mini = document.body.classList.toggle("sidebar-collapsed");
    try {
      localStorage.setItem("hcm-sidebar", mini ? "mini" : "full");
    } catch {}
  };
  const logout = async () => {
    await signOut();
    router.replace("/login");
  };

  return (
    <>
      <aside className="app-sidebar">
        <Link href="/dashboard" className="sidebar-logo" title="HCM Lite">
          <span className="logo-mark">H</span>
          <span className="logo-text">
            HCM<span>Lite</span>
            <span className="logo-sub">{me.companyName}</span>
          </span>
        </Link>
        <nav className="sidebar-scroll">
          {MENU.map((group) => {
            const items = group.items.filter((i) => i.roles.includes(me.role));
            if (!items.length) return null;
            return (
              <div key={group.title}>
                <div className="menu-title">{group.title}</div>
                {items.map((item) => {
                  const Icon = item.icon;
                  const label = labelFor(item, me.role);
                  const active = pathname === item.href || pathname.startsWith(item.href + "/");
                  return (
                    <Link key={item.href} href={item.href} className={`menu-link ${active ? "active" : ""}`} title={label}>
                      <span className="menu-icon">
                        <Icon size={18} />
                      </span>
                      <span className="menu-text">{label}</span>
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>
        <div className="sidebar-promo">
          <span className="promo-ico">
            <IconSparkles size={18} />
          </span>
          <h6>Ask HCM Assistant</h6>
          <p>Get answers from live attendance, leave and payroll data.</p>
          <button onClick={() => setChatOpen(true)}>Open assistant</button>
        </div>
        <div className="sidebar-user">
          <Avatar name={me.name} />
          <div className="user-meta">
            <div className="text-body-strong fw-medium text-truncate">{me.name}</div>
            <RoleBadge role={me.role} />
          </div>
          <button className="logout" onClick={logout} title="Sign out" aria-label="Sign out">
            <IconLogout size={17} />
          </button>
        </div>
      </aside>
      <div className="sidebar-overlay" onClick={() => document.body.classList.remove("sidebar-open")} />

      <main className="page-wrapper">
        <header className="app-header">
          <button className="icon-btn" onClick={toggleSidebar} aria-label="Toggle menu">
            <IconMenu2 size={18} />
          </button>
          <Greeting name={me.name} />
          <div className="ms-auto d-flex align-items-center gap-2">
            {me.role !== "employee" && <HeaderSearch />}
            <button className="btn-ai d-none d-sm-inline-flex" onClick={() => setChatOpen(true)}>
              <IconSparkles size={16} /> Ask AI
            </button>
            <ThemeToggle />
            <Notifications />
            <UserMenu onSignOut={logout} />
          </div>
        </header>
        <div className="content">{children}</div>
      </main>

      <AiChat open={chatOpen} onOpenChange={setChatOpen} />
    </>
  );
}

function Greeting({ name }: { name: string }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the greeting depends on the viewer's clock
    setNow(new Date());
  }, []);
  if (!now) return <div className="header-greet" />;
  const h = now.getHours();
  const part = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  return (
    <div className="header-greet">
      <strong>
        {part}, {name.split(" ")[0]} 👋
      </strong>
      <span>{now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span>
    </div>
  );
}

function HeaderSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  return (
    <form
      className="header-search"
      onSubmit={(e) => {
        e.preventDefault();
        router.push(`/employees?q=${encodeURIComponent(q.trim())}`);
      }}
    >
      <IconSearch size={16} />
      <input className="form-control" placeholder="Search employees..." value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search employees" />
    </form>
  );
}

function useOutside(ref: React.RefObject<HTMLElement | null>, close: () => void) {
  useEffect(() => {
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && close();
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [ref, close]);
}

function Notifications() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  useOutside(ref, () => setOpen(false));
  const pathname = usePathname();

  useEffect(() => {
    let alive = true;
    const load = () =>
      api<AppNotification[]>("/notifications")
        .then((n) => alive && setItems(n))
        .catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [pathname]);

  const unread = items.filter((n) => !n.read).length;
  const markAll = async () => {
    await api("/notifications/read", { body: { id: "all" } }).catch(() => {});
    setItems((list) => list.map((n) => ({ ...n, read: true })));
  };

  return (
    <div className="position-relative" ref={ref}>
      <button className="icon-btn" onClick={() => setOpen((o) => !o)} aria-label="Notifications">
        <IconBell size={18} />
        {unread > 0 && <span className="dot">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <div className="dropdown-c">
          <div className="d-flex justify-content-between align-items-center px-3 py-2 border-bottom">
            <strong className="text-heading">Notifications</strong>
            {unread > 0 && (
              <button className="btn btn-link btn-sm p-0" onClick={markAll}>
                Mark all read
              </button>
            )}
          </div>
          <div className="notif-list">
            {items.length === 0 && <div className="p-4 text-center fs-13">You are all caught up.</div>}
            {items.slice(0, 8).map((n) => (
              <Link
                key={n.id}
                href={n.link ?? "/notifications"}
                className={`notif-item ${n.read ? "" : "unread"}`}
                onClick={() => {
                  setOpen(false);
                  if (!n.read) api("/notifications/read", { body: { id: n.id } }).catch(() => {});
                }}
              >
                <div className="fw-medium">{n.title}</div>
                <div className="fs-13 text-muted">{n.body}</div>
                <div className="fs-12 text-muted mt-1">{prettyDateTime(n.createdAt)}</div>
              </Link>
            ))}
          </div>
          <Link href="/notifications" className="dd-item justify-content-center" onClick={() => setOpen(false)}>
            View all notifications
          </Link>
        </div>
      )}
    </div>
  );
}

function UserMenu({ onSignOut }: { onSignOut: () => void }) {
  const { me } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutside(ref, () => setOpen(false));
  if (!me) return null;
  return (
    <div className="position-relative" ref={ref}>
      <button className="border-0 bg-transparent p-0" onClick={() => setOpen((o) => !o)} aria-label="Account menu">
        <Avatar name={me.name} />
      </button>
      {open && (
        <div className="dropdown-c">
          <div className="px-3 py-3 border-bottom d-flex gap-2 align-items-center">
            <Avatar name={me.name} />
            <div className="min-w-0">
              <div className="text-heading fw-medium text-truncate">{me.name}</div>
              <div className="fs-12 text-truncate">{me.email}</div>
            </div>
          </div>
          <Link href="/profile" className="dd-item" onClick={() => setOpen(false)}>
            <IconUserCircle size={16} /> My profile
          </Link>
          <Link href="/profile#password" className="dd-item" onClick={() => setOpen(false)}>
            <IconLock size={16} /> Change password
          </Link>
          <button className="dd-item text-danger" onClick={onSignOut}>
            <IconLogout size={16} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
