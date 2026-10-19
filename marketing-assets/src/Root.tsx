import "./index.css";
import { Folder } from "remotion";
import { HeroLoopCompositions } from "./hero/HeroLoop";
import { OgCompositions } from "./og/OgVideo";
import { ReelCompositions } from "./reel/Reel";
import { CebuLensStill } from "./stills/CebuLens";
import { ClustersStill } from "./stills/Clusters";
import { SkyPosterStills } from "./stills/SkyPoster";

/**
 * Every composition the story site renders: the sky stills, the hero loop,
 * the animated Open Graph card. Each file registers its own compositions next
 * to the component, so sizes, timing and defaults sit beside the code that
 * uses them. See docs/redesign/03-assets.md.
 */
export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Folder name="Sky">
        <SkyPosterStills />
        <ClustersStill />
        <CebuLensStill />
      </Folder>
      <Folder name="Hero">
        <HeroLoopCompositions />
      </Folder>
      <Folder name="OG">
        <OgCompositions />
      </Folder>
      <Folder name="Reel">
        <ReelCompositions />
      </Folder>
    </>
  );
};
