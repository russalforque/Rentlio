import { createContext } from 'react'

/** Portals retain React context, so landlord dialogs can share the workspace theme. */
export const LandlordWorkspace = createContext(false)
