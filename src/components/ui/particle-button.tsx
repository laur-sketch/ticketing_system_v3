"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MousePointerClick } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/cn";

interface ParticleButtonProps extends ButtonProps {
  onSuccess?: () => void;
  successDuration?: number;
}

type Particle = {
  id: number;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
};

function SuccessParticles({ particles }: { particles: Particle[] }) {
  return (
    <AnimatePresence>
      {particles.map((particle, i) => (
        <motion.div
          key={particle.id}
          className="fixed h-1 w-1 rounded-full bg-black dark:bg-white"
          style={{ left: particle.x, top: particle.y }}
          initial={{
            scale: 0,
            x: 0,
            y: 0,
          }}
          animate={{
            scale: [0, 1, 0],
            x: [0, particle.targetX],
            y: [0, particle.targetY],
          }}
          transition={{
            duration: 0.6,
            delay: i * 0.1,
            ease: "easeOut",
          }}
        />
      ))}
    </AnimatePresence>
  );
}

function ParticleButton({
  children,
  onClick,
  onSuccess,
  successDuration = 1000,
  className,
  ...props
}: ParticleButtonProps) {
  const [particles, setParticles] = React.useState<Particle[]>([]);
  const buttonRef = React.useRef<HTMLButtonElement>(null);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    onClick?.(e);
    if (e.defaultPrevented) return;

    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      setParticles(
        Array.from({ length: 6 }, (_, i) => ({
          id: Date.now() + i,
          x: centerX,
          y: centerY,
          targetX: (i % 2 ? 1 : -1) * (Math.random() * 50 + 20),
          targetY: -Math.random() * 50 - 20,
        })),
      );
    }

    onSuccess?.();
    window.setTimeout(() => {
      setParticles([]);
    }, successDuration);
  };

  return (
    <>
      {particles.length > 0 ? <SuccessParticles particles={particles} /> : null}
      <Button
        ref={buttonRef}
        onClick={handleClick}
        className={cn("relative gap-2 transition-transform duration-100", particles.length > 0 && "scale-95", className)}
        {...props}
      >
        {children}
        <MousePointerClick className="h-4 w-4" />
      </Button>
    </>
  );
}

export { ParticleButton };
