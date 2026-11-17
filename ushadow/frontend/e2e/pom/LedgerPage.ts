/**
 * LedgerPage - Page Object Model for the Ledger page (/ledger).
 *
 * The page is behind the feature flag `ledger_memory` and needs the `ledger`
 * service. Tabs: Timeline, Facts, Known names.
 * Test ids come from `ledger` in ui-contract.ts.
 */

import { type Page, type Locator, expect } from '@playwright/test'
import { BasePage } from './BasePage'
import { ledger, page as pageIds, tabs, settingField } from '../../src/testing/ui-contract'

export class LedgerPage extends BasePage {
  readonly page: Page
  readonly pageContainer: Locator
  readonly unavailable: Locator
  readonly retryButton: Locator
  readonly partialWarning: Locator

  // Tabs
  readonly timelineTab: Locator
  readonly factsTab: Locator
  readonly knownNamesTab: Locator

  // Timeline
  readonly prevDayButton: Locator
  readonly nextDayButton: Locator
  readonly todayButton: Locator
  readonly dateField: Locator
  readonly timelineEmpty: Locator

  // Facts
  readonly factQueryField: Locator
  readonly factSearchButton: Locator
  readonly includeClosedCheckbox: Locator
  readonly factsEmpty: Locator
  readonly whyModal: Locator

  // Known names
  readonly knownNameInput: Locator
  readonly knownAliasesInput: Locator
  readonly knownTypeSelect: Locator
  readonly knownNameAddButton: Locator
  readonly knownNamesEmpty: Locator

  constructor(page: Page) {
    super(page)
    this.page = page

    this.pageContainer = this.getByTestId(pageIds.container(ledger.pageName))
    this.unavailable = this.getByTestId(ledger.unavailable)
    this.retryButton = this.getByTestId(ledger.retry)
    this.partialWarning = this.getByTestId(ledger.partialWarning)

    this.timelineTab = this.getByTestId(tabs.button(ledger.tabs.timeline))
    this.factsTab = this.getByTestId(tabs.button(ledger.tabs.facts))
    this.knownNamesTab = this.getByTestId(tabs.button(ledger.tabs.knownNames))

    this.prevDayButton = this.getByTestId(ledger.timeline.prevDay)
    this.nextDayButton = this.getByTestId(ledger.timeline.nextDay)
    this.todayButton = this.getByTestId(ledger.timeline.today)
    this.dateField = this.getByTestId(ledger.timeline.dateField)
    this.timelineEmpty = this.getByTestId(ledger.timeline.empty)

    this.factQueryField = this.getByTestId(ledger.facts.queryField)
    this.factSearchButton = this.getByTestId(ledger.facts.search)
    this.includeClosedCheckbox = this.getByTestId(ledger.facts.includeClosed)
    this.factsEmpty = this.getByTestId(ledger.facts.empty)
    this.whyModal = this.getByTestId(ledger.facts.whyModal)

    this.knownNameInput = this.getByTestId(settingField.input(ledger.knownNames.nameField))
    this.knownAliasesInput = this.getByTestId(settingField.input(ledger.knownNames.aliasesField))
    this.knownTypeSelect = this.getByTestId(settingField.select(ledger.knownNames.typeField))
    this.knownNameAddButton = this.getByTestId(ledger.knownNames.add)
    this.knownNamesEmpty = this.getByTestId(ledger.knownNames.empty)
  }

  async goto(): Promise<void> {
    await this.page.goto('/ledger')
  }

  async waitForLoad(): Promise<void> {
    await this.pageContainer.waitFor({ state: 'visible' })
  }

  // Tab navigation

  async goToTimelineTab(): Promise<void> {
    await this.timelineTab.click()
    await this.getByTestId(tabs.panel(ledger.tabs.timeline)).waitFor({ state: 'visible' })
  }

  async goToFactsTab(): Promise<void> {
    await this.factsTab.click()
    await this.getByTestId(tabs.panel(ledger.tabs.facts)).waitFor({ state: 'visible' })
  }

  async goToKnownNamesTab(): Promise<void> {
    await this.knownNamesTab.click()
    await this.getByTestId(tabs.panel(ledger.tabs.knownNames)).waitFor({ state: 'visible' })
  }

  // Timeline

  /** Show a day; `day` is `YYYY-MM-DD` */
  async pickDay(day: string): Promise<void> {
    await this.dateField.fill(day)
  }

  getConversation(id: string): Locator {
    return this.getByTestId(ledger.timeline.conversation(id))
  }

  getGap(id: string): Locator {
    return this.getByTestId(ledger.timeline.gap(id))
  }

  // Facts

  async searchFacts(query: string): Promise<void> {
    await this.factQueryField.fill(query)
    await this.factSearchButton.click()
  }

  getFact(id: string): Locator {
    return this.getByTestId(ledger.fact.row(id))
  }

  async openWhy(factId: string): Promise<void> {
    await this.getByTestId(ledger.fact.why(factId)).click()
    await this.whyModal.waitFor({ state: 'visible' })
  }

  async closeWhy(): Promise<void> {
    await this.closeModal(ledger.facts.whyModal)
  }

  async markWrong(factId: string): Promise<void> {
    await this.getByTestId(ledger.fact.wrong(factId)).click()
  }

  /** Click "Forget" and confirm in the dialog */
  async forgetFact(factId: string): Promise<void> {
    await this.getByTestId(ledger.fact.forget(factId)).click()
    await this.getByTestId('confirm-dialog-confirm').click()
  }

  // Known names

  async addKnownName(name: string, aliases = '', type = ''): Promise<void> {
    await this.knownNameInput.fill(name)
    await this.knownAliasesInput.fill(aliases)
    await this.knownTypeSelect.selectOption(type)
    await this.knownNameAddButton.click()
  }

  getKnownName(id: string): Locator {
    return this.getByTestId(ledger.knownNames.row(id))
  }

  /** Click "Remove" and confirm in the dialog */
  async removeKnownName(id: string): Promise<void> {
    await this.getByTestId(ledger.knownNames.remove(id)).click()
    await this.getByTestId('confirm-dialog-confirm').click()
  }

  // Assertions

  async expectUnavailable(): Promise<void> {
    await expect(this.unavailable).toBeVisible()
  }

  async expectUnknownSpeaker(factId: string): Promise<void> {
    await expect(this.getByTestId(ledger.fact.unknownSpeaker(factId))).toBeVisible()
  }

  async expectClosed(factId: string): Promise<void> {
    await expect(this.getByTestId(ledger.fact.closed(factId))).toBeVisible()
  }
}
