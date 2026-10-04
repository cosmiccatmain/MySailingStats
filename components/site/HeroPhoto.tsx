"use client";

import Image from "next/image";
import { useState } from "react";

/** The home page photograph. If it isn't available, the panel keeps its plain sea-grey fill. */
export function HeroPhoto() {
  const [ok, setOk] = useState(true);
  return (
    <figure className="photo">
      {ok && (
        <Image
          src="/photos/hero.jpg"
          alt="Optimist dinghies rounding an orange racing mark"
          fill
          priority
          sizes="(max-width: 1140px) 96vw, 1100px"
          onError={() => setOk(false)}
        />
      )}
      {ok && (
        <figcaption>
          Photo:{" "}
          <a href="https://commons.wikimedia.org/wiki/File:005-_Optimist_(Loctudy_2012).jpg" target="_blank" rel="noreferrer">
            jakez29120
          </a>
          , CC BY-SA 2.0
        </figcaption>
      )}
    </figure>
  );
}
