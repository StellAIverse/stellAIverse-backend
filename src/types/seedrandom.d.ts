declare namespace seedrandom {
  interface PRNG {
    (): number;
  }
}

declare function seedrandom(seed?: string | number): seedrandom.PRNG;

export = seedrandom;
