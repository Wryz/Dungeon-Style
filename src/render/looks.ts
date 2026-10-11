import type { ThemeId } from '../arena/themes';
import type { EnemyKind } from '../sim/enemies';
import { BRAWLER_PALETTE, ENEMY_PALETTES, type GearLook, type Palette } from './fighterView';

/** What each opponent wears depends on where you fight them. */
export function lookFor(kind: EnemyKind, theme: ThemeId | null): { palette: Palette; gear?: GearLook } {
  switch (kind) {
    case 'imp':
      return { palette: { skin: '#7a3a8c', shirt: '#7a3a8c', pants: '#2a1830', gloves: '#3a1a40', boots: '#2a1830', hair: '#140a18', sleeves: 'skin', bald: true, addons: { horns: 'small', eyes: '#ffd23a', tail: true } } };
    case 'demon':
      return { palette: { skin: '#b0281f', shirt: '#b0281f', pants: '#2a0e0e', gloves: '#1a0808', boots: '#1a0808', hair: '#1a0808', sleeves: 'skin', bald: true, addons: { horns: 'big', eyes: '#ffb020', tail: true } } };
    case 'champion':
      return {
        palette: { skin: '#8a5a40', shirt: '#8a5a40', pants: '#d8a71c', gloves: '#d8a71c', boots: '#f2f2f2', hair: '#151515', sleeves: 'skin', shins: '#8a5a40', bald: true },
        gear: { helmet: { material: 'leather', tier: 1 } },
      };
    case 'minotaur':
      return { palette: { skin: '#5e3b24', shirt: '#5e3b24', pants: '#3a2414', gloves: '#2a1a10', boots: '#2a1a10', hair: '#2a1a10', sleeves: 'skin', bald: true, addons: { horns: 'bull', snout: true, eyes: '#ff4020', tail: true } }, gear: { legs: { material: 'iron', tier: 2 } } };
    case 'cyclops':
      return { palette: { skin: '#7d9468', shirt: '#7d9468', pants: '#5a4632', gloves: '#5a4632', boots: '#3a2c20', hair: '#2a2a1a', sleeves: 'skin', bald: true, addons: { cyclops: true, eyes: '#fff3a0' } }, gear: { chest: { material: 'leather', tier: 1 } } };
    default:
      break;
  }
  const base = ENEMY_PALETTES[kind] ?? BRAWLER_PALETTE;
  switch (theme) {
    case 'ring':
      // Boxers: shirtless, coloured trunks, gloves, white boots.
      return { palette: { ...base, shirt: base.skin, sleeves: 'skin', pants: kind === 'bruiser' ? '#1f1f22' : '#2a62c9', shins: base.skin, gloves: '#c0392b', boots: '#f2f2f2' } };
    case 'street':
      return { palette: { ...base, shirt: kind === 'kicker' ? '#2b2b2b' : base.shirt === base.skin ? '#4a4a52' : base.shirt, sleeves: 'shirt', pants: '#3a4a66', shins: undefined, gloves: base.skin, boots: '#1a1a1a' } };
    case 'grocery':
      // Store staff in green aprons.
      return { palette: { ...base, shirt: '#2f7d4a', sleeves: 'skin', pants: '#2b2d36', shins: undefined, gloves: base.skin, boots: '#1a1a1a' } };
    case 'colosseum':
      return {
        palette: { ...base, shirt: base.skin, sleeves: 'skin', pants: '#7a4e2e', shins: base.skin, gloves: '#5a4632', boots: '#7a4e2e' },
        gear: { helmet: { material: kind === 'bruiser' ? 'steel' : 'iron', tier: kind === 'rookie' ? 1 : 2 }, chest: kind === 'rookie' ? undefined : { material: 'leather', tier: 1 } },
      };
    default:
      return { palette: base, gear: kind === 'bruiser' ? { helmet: { material: 'iron', tier: 2 }, chest: { material: 'iron', tier: 2 } } : undefined };
  }
}
