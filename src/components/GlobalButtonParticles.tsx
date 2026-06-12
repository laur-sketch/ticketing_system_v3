"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

type Particle = {
  id: number;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
};

function buttonLikeTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  const el = target.closest("button, a[href], [role='button']");
  if (!(el instanceof HTMLElement)) return null;
  if (el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true") return null;
  if (el.dataset.noParticles === "true") return null;

  const className = el.className.toString();
  if (el.tagName === "BUTTON" || el.getAttribute("role") === "button") return el;
  if (className.includes("stoic-btn") || className.includes("bg-")) return el;
  if (className.includes("rounded") && /font-(semibold|bold|black)/.test(className)) return el;
  return null;
}

function particlesFromElement(el: HTMLElement): Particle[] {
  const rect = el.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  return Array.from({ length: 6 }, (_, i) => ({
    id: Date.now() + i,
    x: centerX,
    y: centerY,
    targetX: (i % 2 ? 1 : -1) * (Math.random() * 50 + 20),
    targetY: -Math.random() * 50 - 20,
  }));
}

export function GlobalButtonParticles() {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const el = buttonLikeTarget(e.target);
      if (!el) return;

      setParticles(particlesFromElement(el));
      window.setTimeout(() => setParticles([]), 1000);
    }

    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);

  return (
    <AnimatePresence>
      {particles.map((particle, i) => (
        <motion.span
          key={particle.id}
          className="pointer-events-none fixed z-[9999] h-1 w-1 rounded-full bg-black dark:bg-white"
          style={{ left: particle.x, top: particle.y }}
          initial={{ scale: 0, x: 0, y: 0, opacity: 0 }}
          animate={{
            scale: [0, 1, 0],
            x: [0, particle.targetX],
            y: [0, particle.targetY],
            opacity: [0, 1, 0],
          }}
          transition={{ duration: 0.6, delay: i * 0.06, ease: "easeOut" }}
        />
      ))}
    </AnimatePresence>
  );
}
