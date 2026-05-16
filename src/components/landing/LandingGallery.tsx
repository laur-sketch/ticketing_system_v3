import { LandingPhoto } from "@/components/landing/LandingPhoto";
import { LANDING_IMAGES } from "@/lib/landing-images";

const GALLERY = [
  {
    src: LANDING_IMAGES.architecture,
    alt: "Modern glass architecture with geometric lines and amber light",
    caption: "Structural clarity",
  },
  {
    src: LANDING_IMAGES.infrastructure,
    alt: "Network switches and server blades with operational status lights",
    caption: "Infrastructure you can trust",
  },
  {
    src: LANDING_IMAGES.workspace,
    alt: "Focused developer workspace with warm accent lighting",
    caption: "Disciplined operations",
  },
] as const;

export function LandingGallery() {
  return (
    <section className="stoic-card px-5 py-8 sm:px-8 sm:py-10">
      <p className="stoic-label text-center">Operational reality</p>
      <h2 className="mt-2 text-center text-xl font-bold text-foreground sm:text-2xl">
        Built for teams that run critical systems
      </h2>
      <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-muted">
        From intake to resolution—architecture, infrastructure, and the workspace where your operators do their best work.
      </p>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {GALLERY.map((item) => (
          <LandingPhoto
            key={item.src}
            src={item.src}
            alt={item.alt}
            caption={item.caption}
            aspectClassName="aspect-[4/3]"
            overlay="bottom"
          />
        ))}
      </div>
    </section>
  );
}
