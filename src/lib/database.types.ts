// The app's database types: the generated schema (database.generated.ts, refresh
// with `npm run db:types`) with precise view rows and RPC signatures layered on
// top (database.overrides.ts). Import from this file, never from the generated one.
import type { Database as Generated, Json } from './database.generated'
import type { FunctionOverrides, ViewRows } from './database.overrides'
import type { DemoFunctions } from '@/features/demo-data/types'

export type { Json }

type G = Generated['public']

export type Database = Omit<Generated, 'public'> & {
  public: Omit<G, 'Views' | 'Functions'> & {
    Views: {
      [K in keyof G['Views']]: K extends keyof ViewRows
        ? Omit<G['Views'][K], 'Row'> & { Row: ViewRows[K]['Row'] }
        : G['Views'][K]
    }
    Functions: Omit<G['Functions'], keyof FunctionOverrides | keyof DemoFunctions> & FunctionOverrides & DemoFunctions
  }
}

type PublicSchema = Database['public']

export type Tables<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Row']
export type TablesUpdate<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Update']
export type TablesInsert<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Insert']
export type Views<T extends keyof PublicSchema['Views']> = PublicSchema['Views'][T]['Row']
export type Enums<T extends keyof PublicSchema['Enums']> = PublicSchema['Enums'][T]

// --- Drift checks ------------------------------------------------------------------
// If a migration changes a view or an RPC, these fail to compile until the
// overrides are updated.

type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
type Assert<T extends true> = T

/** Same columns, and every override type narrows the generated (nullable) one. */
type ViewMatches<K extends keyof ViewRows & keyof G['Views']> =
  Exact<keyof ViewRows[K]['Row'], keyof G['Views'][K]['Row']> extends true
    ? ViewRows[K]['Row'] extends G['Views'][K]['Row']
      ? true
      : false
    : false

/** Same argument names, and every override exists in the database. */
type FunctionMatches<K extends keyof FunctionOverrides> = K extends keyof G['Functions']
  ? Exact<keyof NonNullable<FunctionOverrides[K]['Args']>, keyof NonNullable<G['Functions'][K]['Args']>>
  : false

type AllTrue<T> = T[keyof T] extends true ? true : false

export type _ViewsInSync = Assert<AllTrue<{ [K in keyof ViewRows & keyof G['Views']]: ViewMatches<K> }>>
export type _AllViewsOverridden = Assert<Exact<keyof ViewRows, keyof G['Views']>>
export type _FunctionsInSync = Assert<AllTrue<{ [K in keyof FunctionOverrides]: FunctionMatches<K> }>>
