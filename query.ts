import { gql, request } from 'graphql-request'

export const processValue = (obj: any): any => {
  if (obj == null) {
    return obj
  }
  if (Array.isArray(obj)) {
    return obj.map(processValue) as any
  }
  if (typeof obj === 'object') {
    const { value, __kind, ...other } = obj
    const entries = Object.entries(other)
    const rest = Object.fromEntries(entries.map(([key, value]) => [key, processValue(value)]))
    if ('value' in obj) {
      return { [__kind]: processValue(value), ...rest }
    }
    if ('__kind' in obj) {
      if (entries.length === 0) {
        return obj.__kind
      }
      return { [__kind]: rest }
    }
    return rest
  }
  return obj
}

export const queryExtrinsic = async (url: string, id: string) => {
  const query = gql`
    query q($id: String!) {
      calls(limit: 1000, where: { extrinsic: { id_eq: $id } }) {
        id
        args
        name
        origin
        extrinsic {
          hash
        }
      }
    }
  `

  const res: any = await request(url, query, { id })

  return (res.calls as any[]).map((x: any) => ({
    id: x.id,
    args: processValue(x.args),
    name: x.name,
    origin: processValue(x.origin),
    hash: x.extrinsic.hash,
  }))[0]
}

export const queryEvents = async (url: string, fromBlock: number, toBlock: number, event: string) => {
  const query = gql`
    query q($fromBlock: Int, $toBlock: Int, $event: String) {
      events(limit: 1000, where: { name_eq: $event, block: { height_gte: $fromBlock, height_lt: $toBlock } }) {
        extrinsic {
          id
          hash
        }
        block {
          height
          hash
        }
        call {
          id
          name
          args
          success
        }
        args
        name
        id
      }
    }
  `
  const res: any = await request(url, query, { fromBlock, toBlock, event })

  return (res.events as any[]).map((x: any) => ({
    id: x.id,
    height: x.block.height,
    blockHash: x.block.hash,
    extrinsicHash: x.extrinsic?.hash,
    extrinsicId: x.extrinsic?.id,
    call: x.call && {
      id: x.call.id,
      name: x.call.name,
      args: processValue(x.call.args),
      success: x.call.success,
    },
    event: x.name,
    args: processValue(x.args),
  }))
}
