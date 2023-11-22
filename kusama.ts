import { encodeAddress } from '@polkadot/keyring'
import { ApiPromise, HttpProvider } from '@polkadot/api'

import { queryEvents, queryExtrinsic } from './query'

const main = async () => {
  const relayUrl = 'https://kusama-rpc.polkadot.io'
  const paraUrl = 'https://karura-rpc.aca-api.network'
  const relayIndexerUrl = 'https://kusama.explorer.subsquid.io/graphql'
  const paraIndexerUrl = 'https://karura.explorer.subsquid.io/graphql'

  // https://kusama.subscan.io/block/20465806?tab=event&event=20465806-4
  // the block the new runtime is upgraded
  const startRelayBlock = 20465806
  const startParaBlock = 5594800
  // https://kusama.subscan.io/block/20475025?tab=event&event=20475025-0
  // the block para XCM version is changed to 3
  const endRelayBlock = 20475025
  const endParaBlock = 5599360

  const paraAccount = 'F7fq1jMZkfuCuoMTyiEVAP2DMpMt18WopgBqTJznLihLNbZ' // paraid 2000

  const queryBalance = async (relayBlock: number, paraBlock: number) => {
    const relayProvider = new HttpProvider(relayUrl)
    const paraProvider = new HttpProvider(paraUrl)

    const relayApi = await ApiPromise.create({
      provider: relayProvider,
      noInitWarn: true,
    })
    const paraApi = await ApiPromise.create({
      provider: paraProvider,
      noInitWarn: true,
    })

    const relayBlockHash = await relayApi.rpc.chain.getBlockHash(relayBlock)
    const relayApiAt = await relayApi.at(relayBlockHash)

    const paraBlockHash = await paraApi.rpc.chain.getBlockHash(paraBlock)
    const paraApiAt = await paraApi.at(paraBlockHash)

    const relayBalance: any = await relayApiAt.query.system.account(paraAccount)
    const paraBalance: any = await paraApiAt.query.tokens.totalIssuance({
      Token: 'KSM',
    })

    return {
      relay: (relayBalance.data.free.toBigInt() as bigint) + relayBalance.data.reserved.toBigInt(),
      para: paraBalance.toBigInt() as bigint,
    }
  }

  const format = (num: bigint) => {
    return Number(num) / 1e12
  }

  const checkBalances = async () => {
    const before = await queryBalance(startRelayBlock, startParaBlock)
    const after = await queryBalance(endRelayBlock, endParaBlock)
    console.log('-----before-----')
    console.log('KSM reserve', format(before.relay))
    console.log('KSM issuance', format(before.para))
    console.log('KSM diff', format(before.relay - before.para))

    console.log('-----after-----')
    console.log('KSM reserve', format(after.relay))
    console.log('KSM issuance', format(after.para))
    console.log('KSM diff', format(after.relay - after.para))

    console.log('----------------')
    console.log('Extra KSM', format(after.relay - after.para - before.relay + before.para))
  }

  await checkBalances()

  const xcmEvents = await queryXcmEvents(relayIndexerUrl, startRelayBlock, endRelayBlock)

  const extrinsicIds = xcmEvents.map((x) => x.extrinsicId)

  const results = []

  for (const id of extrinsicIds) {
    const tx = await queryExtrinsic(relayIndexerUrl, id)
    const origin = tx.origin.system.Signed
    const { assets, beneficiary, dest } = tx.args

    const destParaId = (dest.V2 ?? dest.V3)?.interior?.X1?.Parachain
    if (destParaId !== 2000) {
      continue
    }

    const amount = (assets.V3 ?? assets.V2)?.[0]?.fun?.Fungible
    const destAccountRaw = (beneficiary.V3 ?? beneficiary.V2)?.interior?.X1?.AccountId32?.id

    const destAccount = encodeAddress(destAccountRaw, 8)

    results.push({
      amount: BigInt(amount),
      destAccount,
      origin: encodeAddress(origin, 2),
      hash: tx.hash,
    })
  }

  console.log('-----results-----')
  console.table(results)

  const total = results.reduce((acc, x) => acc + x.amount, 0n)
  console.log('Total KSM', format(total))
}

const queryXcmEvents = async (url: string, fromBlock: number, toBlock: number) => {
  const maxBlocksToQuery = 200
  const events = []
  while (fromBlock < toBlock) {
    const from = fromBlock
    const to = fromBlock + Math.min(maxBlocksToQuery, toBlock)
    process.stdout.write(`Remaining ${toBlock - fromBlock}...\r`)

    const res = await queryEvents(url, from, to, 'XcmPallet.Attempted')

    const resFiltered = res.filter((x) => x.args.outcome.Incomplete)

    events.push(...resFiltered)

    fromBlock = to
  }

  process.stdout.write(`                                          \r\n\n`)

  return events
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
