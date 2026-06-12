"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CheckIcon } from "lucide-react";

const BorderAvatarDemo = () => {
  return (
    <div className="flex items-center justify-center px-4">
      <div className="relative w-fit">
        <Avatar className="ring-offset-background ring-2 ring-teal-600 ring-offset-2 dark:ring-teal-400">
          <AvatarImage
            src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=96&h=96&q=80"
            alt="border avatar"
          />
          <AvatarFallback className="text-xs">HR</AvatarFallback>
        </Avatar>
        <span className="absolute -bottom-1.5 -right-1.5 inline-flex size-4 items-center justify-center rounded-full bg-teal-600 dark:bg-teal-400">
          <CheckIcon className="size-3 text-white" />
        </span>
      </div>
    </div>
  );
};

export default BorderAvatarDemo;
