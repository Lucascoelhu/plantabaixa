export const PLANS = {
  free: {
    id: 'free',
    name: 'Free',
    limits: {
      maxElements: 10,
      canExport: false,
      tools: ['wall', 'room', 'select', 'delete'],
    },
  },
  pro: {
    id: 'pro',
    name: 'PRO',
    limits: {
      maxElements: Infinity,
      canExport: true,
      tools: ['wall', 'room', 'door', 'window', 'measure', 'stair', 'text', 'select', 'delete'],
    },
  },
}

export const PRO_TOOLS = ['door', 'window', 'measure', 'stair', 'text']

export function getPlan(user)              { return user?.plan === 'pro' ? PLANS.pro : PLANS.free }
export function canUseTool(user, toolId)   { return getPlan(user).limits.tools.includes(toolId) }
export function canAddElement(user, count) { return count < getPlan(user).limits.maxElements }
export function canExport(user)            { return getPlan(user).limits.canExport }
