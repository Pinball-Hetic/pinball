import type { DmdMapContent } from '@pinball/dmd-core'
import { DEFAULT_MAP_ID } from '@pinball/shared-types'
import { getDmdContent } from '@pinball/maps/dmd'

const MAP_ID = process.env.NEXT_PUBLIC_MAP_ID ?? DEFAULT_MAP_ID

export const mapDmdContent: DmdMapContent = getDmdContent(MAP_ID) ?? {}
