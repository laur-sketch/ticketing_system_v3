import { LandingPhoto } from "@/components/landing/LandingPhoto";
import { LANDING_IMAGES } from "@/lib/landing-images";

export function LandingAccessVisual() {
  return (
    <LandingPhoto
      src={LANDING_IMAGES.workspace}
      alt="Developer workspace with warm lighting and focused operations setup"
      caption="Built for focused, disciplined operations"
      aspectClassName="aspect-[16/10] min-h-[220px]"
      overlay="full"
      className="mb-8"
    />
  );
}
