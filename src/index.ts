#!/usr/bin/env node

import process from 'process'
import yargs from 'yargs/yargs'
import { gitClient } from './git'
import logger from './logger'

const argParser = yargs(process.argv.slice(2)).options({
  source: {
    describe: 'The source (boilerplate) URL',
    type: 'string',
    demandOption: true
  },
  remote: {
    describe: 'The local remote name',
    type: 'string',
    default: 'boilerplate'
  },
  'source-branch': {
    describe: 'The source branch to pull from',
    type: 'string',
    default: 'master'
  },
  message: {
    describe: 'The commit message to use in the merge',
    type: 'string',
    default: 'Merge boilerplate changes'
  },
  branch: {
    describe: 'The local branch to work in',
    type: 'string',
    default: 'feat/boilerplate-merge'
  }
})

async function waitForNextKey (): Promise<string> {
  return await new Promise((resolve) => {
    const wasRaw = process.stdin.isRaw
    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.once('data', (data) => {
      process.stdin.pause()
      process.stdin.setRawMode(wasRaw)
      resolve(data.toString())
    })
  })
}

async function main (): Promise<void> {
  const argv = await argParser.argv

  if (!(await gitClient.checkIsRepo())) {
    logger.fatal('Current directory is not a git repository.')
    process.exit(1)
  }

  const status = await gitClient.status()

  if (!status.isClean()) {
    logger.warn(
      'Current branch is not clean, you should probably stash / commit'
    )
    return
  }

  const startingBranch = status.current
  if (!startingBranch) {
    logger.fatal('Not on a branch. Checkout onto a branch and try again')
    process.exit(1)
  }

  // Find / create the working branch (source for the PR)
  const localBranches = await gitClient.branchLocal()
  const targetExists = localBranches.all.includes(argv.branch)

  if (!targetExists) {
    logger.info(
      `Target branch "${argv.branch}" does not exist, attempting to make it.`
    )

    await gitClient.checkoutLocalBranch(argv.branch)

    logger.info('Created the target branch')
  } else {
    logger.info(`Target branch "${argv.branch}" exists, using it`)

    await gitClient.checkout(argv.branch)
  }

  // Find / create the boilerplate remote
  const remotes = await gitClient.getRemotes(true)
  const remoteExists =
    remotes.find((r) => r.name === argv.remote) !== undefined

  if (!remoteExists) {
    logger.info(`Remote "${argv.remote}" does not exist, creating it`)
    await gitClient.addRemote(argv.remote, argv.source)
  } else {
    logger.info(`Remote "${argv.remote}" exists`)
  }

  // Fetch changes from the remote
  logger.info('Fetching changes from remote')
  await gitClient.fetch(argv.remote, argv.sourceBranch)

  // Merge those changes onto the current branch
  logger.info('Merging changes from remote into the current branch')

  let mergePass = false

  while (!mergePass) {
    try {
      // The histories might not be directly related, but we should still be able to merge
      await gitClient.merge([`${argv.remote}/${argv.sourceBranch}`, '--allow-unrelated-histories', '--squash'])
      mergePass = true
    } catch (err) {
      logger.warn(
        `Merge failed, see below for logs. Press c when the merge is finished, e to exit.\n\n${
          (err as Error).message
        }`
      )

      const key = await waitForNextKey()
      if (key === 'e') {
        process.exit(0)
      }
      if (key === 'c') {
        mergePass = true
      }
    }
  }

  const isDirty = !(await gitClient.status()).isClean()
  if (isDirty) {
    logger.info('Staging and committing the changes')
    await gitClient.add('.')
    await gitClient.commit(argv.message)
  }

  logger.info('Pushing to origin')
  await gitClient.push('origin', argv.branch)

  const origin = remotes.find((r) => r.name === 'origin')

  logger.info('Checking back to starting branch')
  await gitClient.checkout(startingBranch)

  if (origin) {
    logger.info(`Done! You can open the PR at ${origin.refs.push}`)
  } else {
    logger.info('Done!')
  }
}

main().catch(console.error)
