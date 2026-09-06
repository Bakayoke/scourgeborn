import type { CSSProperties } from 'react'
import { ITEM_VISUALS, itemShort, recipeTokens } from './labVisuals'
import type { ItemId, Lang } from './types'

function ItemBadge({ item, lang, size = 'sm' }: { item: ItemId; lang: Lang; size?: 'sm' | 'md' | 'lg' }) {
  const v = ITEM_VISUALS[item]
  return (
    <span
      className={`item-badge ${size}`}
      style={{ '--item-color': v.color, '--item-glow': v.glow } as CSSProperties}
    >
      <span className="item-icon">{v.icon}</span>
      <span className="item-short">{itemShort(item, lang)}</span>
    </span>
  )
}

export function RecipeStrip({ item, lang }: { item: ItemId; lang: Lang }) {
  const tokens = recipeTokens(item)
  return (
    <div className="recipe-strip">
      {tokens.map((token, i) => {
        if (token.t === 'badge') {
          return (
            <span key={`${token.item}-${i}`} className="recipe-step">
              <ItemBadge item={token.item} lang={lang} size="sm" />
            </span>
          )
        }
        if (token.t === 'plus') {
          return (
            <span key={`plus-${i}`} className="recipe-plus" aria-hidden>
              +
            </span>
          )
        }
        if (token.t === 'arrow') {
          return (
            <span key={`arrow-${i}`} className="recipe-arrow" aria-hidden>
              →
            </span>
          )
        }
        const actionClass =
          token.t === 'mix' ? 'recipe-mix' : token.t === 'heat' ? 'recipe-heat' : 'recipe-cool'
        const actionIcon = token.t === 'mix' ? '⚗' : token.t === 'heat' ? '🔥' : '❄'
        return (
          <span key={`${token.t}-${i}`} className={`recipe-action ${actionClass}`} aria-hidden>
            {actionIcon}
          </span>
        )
      })}
    </div>
  )
}
