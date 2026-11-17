// The single source of truth linking invariants and threat-model rows to
// named tests. scripts/report.ts checks that every listed test exists and
// passed, and renders the tables in docs/TEST_REPORT.md and
// docs/THREAT_MODEL.md from this file.
//
// Test ids: `fe:<test fn>` (fe test), `e2e:<substring of the vitest name>`,
// `ui:<substring of the Playwright title>`, `cf:<compile_fail case>`.

export type Row = { id: string; title: string; expected?: string; tests: string[] };

export const INVARIANTS: Row[] = [
  {
    id: "I1",
    title: "Conservation: Σ wei drawn by handlers == msg.value, exactly, per frame or batch",
    tests: [
      "fe:batch_double_count_reverts_overspend", "fe:batch_ten_entries_exact", "fe:batch_fifty_entries_exact", "fe:batch_unspent_reverts",
      "fe:one_tap_checkout_exact", "fe:checkout_duplicate_entry_reverts_overspend", "fe:checkout_one_wei_over_reverts_unspent",
      "fe:checkout_one_wei_under_reverts_overspend", "fe:prop_till_seed_1", "fe:prop_shop_seed_1", "fe:prop_shop_seed_0xfe",
      "fe:ledger_budget_is_monotone_non_increasing", "e2e:exact total once", "e2e:Overspend", "cf:read_value_in_business_logic", "cf:direct_ctx_in_business_logic",
    ],
  },
  {
    id: "I2",
    title: "No stuck ETH: a metered handler called with more value than it spends reverts (Unspent); others stay non-payable",
    tests: [
      "fe:direct_overpay_reverts_unspent", "fe:stray_value_to_zero_wei_handler_reverts_unspent", "fe:value_to_non_metered_handler_reverts",
      "fe:stray_value_to_note_reverts_unspent", "fe:stray_value_to_view_reverts", "fe:plain_eth_transfer_to_shop_reverts",
      "fe:buy_overpay_reverts_unspent", "fe:empty_checkout_with_value_reverts_unspent", "fe:payment_probe_unspent_reverts_from_destructor",
      "e2e:stray ETH to a zero-wei handler",
    ],
  },
  {
    id: "I3",
    title: "No cross-frame leak: transient budget and batch flag are zero at the end of every top-level frame",
    tests: [
      "fe:cross_frame_second_call_cannot_spend_leftover", "fe:cross_frame_batch_after_batch", "fe:cross_frame_through_relay",
      "fe:cross_frame_relay_cannot_reuse_batch_budget", "fe:cross_frame_same_tx_direct_after_batch", "fe:state_is_clean_after_reverted_batch",
      "fe:prop_shop_seed_2", "e2e:cannot spend leftovers in a second call", "e2e:the till is clean after every transaction",
    ],
  },
  {
    id: "I4",
    title: "No foreign code mid-batch: metered logic has no Call effect (compiler-checked); external-call handlers forbid_in_batch",
    tests: [
      "cf:external_call_in_business_logic", "cf:metered_handler_without_call", "cf:till_effect_is_not_ctx", "cf:control_compiles",
      "fe:forbidden_handler_in_zero_value_batch_reverts", "fe:withdraw_in_zero_value_batch_reverts", "fe:refund_in_zero_value_batch_reverts",
      "fe:safe_transfer_in_zero_value_batch_reverts", "fe:foreign_frame_mid_batch_is_rejected", "e2e:ExternalCallInBatch",
    ],
  },
  { id: "I5", title: "No nested batches", tests: ["fe:nested_batch_reverts", "fe:nested_empty_batch_zero_value_still_reverts", "fe:nested_multicall_reverts", "fe:prop_shop_seed_3", "e2e:NestedBatch"] },
  {
    id: "I6",
    title: "Accounting: selfbalance ≥ total_escrow + seller_available; forced ETH only adds sweepable excess",
    tests: [
      "fe:forced_eth_is_sweepable_and_never_breaks_books", "fe:eth_sent_before_deployment_is_sweepable", "fe:refund_all_holders_empties_escrow",
      "fe:prop_shop_seed_4", "fe:prop_shop_seed_5", "fe:withdraw_never_touches_escrow", "e2e:Tobi buys 2 tickets",
    ],
  },
  {
    id: "I7",
    title: "Escrow per item until check-in or release_at; cancelled items refund exactly what each pass paid",
    tests: [
      "fe:buy_exact_mints_and_escrows", "fe:buy_records_price_per_pass", "fe:cancel_then_refund_pays_100_percent", "fe:refund_pays_what_was_paid_after_price_change",
      "fe:redeem_with_eoa_signature_releases_that_pass", "fe:release_after_time_moves_escrow_to_seller", "e2e:cancel then refund", "ui:refunds 100%",
    ],
  },
  {
    id: "I8",
    title: "Seller can't fake check-ins: EIP-712 CheckIn signed by the current holder (or ERC-1271), once, before the deadline",
    tests: [
      "fe:digest_matches_viem_chain_1", "fe:checkin_digest_view_matches_viem", "fe:redeem_wrong_signer_reverts", "fe:redeem_twice_reverts",
      "fe:redeem_expired_reverts", "fe:redeem_high_s_signature_reverts", "fe:redeem_with_compact_signature", "fe:redeem_other_shop_signature_reverts",
      "fe:redeem_other_chain_signature_reverts", "fe:previous_holder_signature_dies_on_transfer", "fe:redeem_erc1271_holder",
      "e2e:cannot fake a check-in", "ui:check-in",
    ],
  },
  {
    id: "I9",
    title: "Seller can't rug through parameters: paid prices fixed, supply ≥ sold, release only later, cancel final, withdraw ≤ available",
    tests: [
      "fe:update_price_does_not_touch_paid_passes", "fe:update_supply_below_sold_reverts", "fe:extend_release_only_later", "fe:cancel_is_final",
      "fe:release_before_time_reverts", "fe:withdraw_never_touches_escrow", "fe:update_rules", "fe:extend_rules",
    ],
  },
  {
    id: "I10",
    title: "Payout safety: checks-effects-interactions, transient lock, forbid_in_batch, failed sends revert cleanly",
    tests: [
      "fe:reentrant_refund_receiver_cannot_double_refund", "fe:withdraw_to_reentrant_receiver_cannot_reenter", "fe:refund_to_rejecting_holder_reverts_and_keeps_books",
      "fe:withdraw_to_rejecting_receiver_keeps_funds", "fe:withdraw_outside_batch_pays_out",
    ],
  },
  {
    id: "I11",
    title: "Limits: qty > 0, sold + qty ≤ supply, per-wallet cap (recipient), Active only, checked arithmetic",
    tests: [
      "fe:buy_zero_qty_reverts", "fe:buy_beyond_supply_reverts_sold_out", "fe:wallet_cap_enforced_per_wallet", "fe:gift_applies_cap_to_recipient",
      "fe:buy_paused_item_reverts", "fe:buy_price_times_qty_overflow_panics", "fe:charge_qty_overflow_panics_before_drawing", "fe:purchase_wallet_cap_boundary",
      "fe:prop_shop_seed_1", "e2e:a gift goes to the recipient",
    ],
  },
  {
    id: "I12",
    title: "Owner-only operations check ctx.caller() == owner, inside batches too; two-step ownership",
    tests: [
      "fe:add_item_by_stranger_reverts_not_owner", "fe:stranger_seller_op_inside_batch_still_owner_checked", "fe:withdraw_by_stranger_reverts",
      "fe:redeem_by_stranger_reverts", "fe:two_step_transfer", "fe:accept_by_stranger_reverts", "fe:old_owner_loses_rights_new_owner_gains_them",
      "e2e:NotOwner", "e2e:two-step",
    ],
  },
];

export const THREATS: Row[] = [
  { id: "T1", title: "Double-count msg.value via std multicall", expected: "Overspend; NaiveShop is drained, Till is not", tests: ["fe:naive_shop_is_drained_by_batched_buys", "fe:till_shop_rejects_the_same_sequence", "e2e:drains NaiveShop", "e2e:the same batch against Till's Shop", "ui:/lab"] },
  { id: "T2", title: "Duplicate the same Buy entry N times", expected: "Overspend", tests: ["fe:checkout_duplicate_entry_reverts_overspend", "e2e:listing the same Buy twice"] },
  { id: "T3", title: "Overpay into a batch", expected: "Unspent{left}", tests: ["fe:checkout_one_wei_over_reverts_unspent", "e2e:overpaying by 1 wei"] },
  { id: "T4", title: "Underpay a batch", expected: "Overspend{wanted,left}", tests: ["fe:checkout_one_wei_under_reverts_overspend", "e2e:underpaying by 1 wei"] },
  { id: "T5", title: "Stray value to a metered handler", expected: "Unspent", tests: ["fe:stray_value_to_note_reverts_unspent", "fe:tip_overpay_reverts_unspent"] },
  { id: "T6", title: "Value to a non-payable handler inside a paid batch", expected: "reverts (non-payable)", tests: ["fe:non_payable_seller_op_in_paid_batch_reverts", "fe:non_metered_view_in_paid_batch_reverts"] },
  { id: "T7", title: "Nested multicall", expected: "NestedBatch", tests: ["fe:nested_multicall_reverts", "fe:nested_batch_reverts"] },
  { id: "T8", title: "Cross-frame leak: same-tx second call with 0 value", expected: "Overspend (budget is zero)", tests: ["fe:cross_frame_relay_cannot_reuse_batch_budget", "fe:cross_frame_same_tx_direct_after_batch", "e2e:cannot spend leftovers"] },
  { id: "T9", title: "Reentrancy from a malicious refund receiver", expected: "PayoutLocked; books unchanged", tests: ["fe:reentrant_refund_receiver_cannot_double_refund", "fe:reentrant_refund_receiver_cannot_buy_with_batch_budget"] },
  { id: "T10", title: "Reentrancy from a pass safeTransferFrom receiver", expected: "safeTransfer refused in batches; re-entry must pay its own way", tests: ["fe:safe_transfer_in_zero_value_batch_reverts", "fe:reentrant_receiver_on_safe_transfer_cannot_spend_others_money"] },
  { id: "T11", title: "Foreign code re-enters a metered handler mid-batch", expected: "ForeignFrame", tests: ["fe:foreign_frame_mid_batch_is_rejected"] },
  { id: "T12", title: "Seller redeems without the holder's signature", expected: "BadSignature", tests: ["fe:redeem_wrong_signer_reverts", "fe:redeem_garbage_signature_reverts", "e2e:cannot fake a check-in"] },
  { id: "T13", title: "Signature replay: same pass twice", expected: "AlreadyRedeemed", tests: ["fe:redeem_twice_reverts", "e2e:replayed signature"] },
  { id: "T14", title: "Signature replay: other shop / other chain", expected: "BadSignature", tests: ["fe:redeem_other_shop_signature_reverts", "fe:redeem_other_chain_signature_reverts", "e2e:another chain or shop"] },
  { id: "T15", title: "Expired deadline", expected: "SignatureExpired", tests: ["fe:redeem_expired_reverts", "e2e:expired deadline"] },
  { id: "T16", title: "Malleable high-s signature; 64-byte compact form", expected: "high-s rejected, compact accepted once", tests: ["fe:redeem_high_s_signature_reverts", "fe:redeem_with_compact_signature", "fe:recover_rejects_high_s_twin", "e2e:high-s twin"] },
  { id: "T17", title: "Refund after redeem", expected: "NotRefundable", tests: ["fe:refund_after_redeem_reverts"] },
  { id: "T18", title: "Refund of a non-cancelled item", expected: "NotRefundable", tests: ["fe:refund_of_active_item_reverts", "fe:refund_of_released_item_reverts", "e2e:non-cancelled item"] },
  { id: "T19", title: "Double refund", expected: "UnknownPass (burned)", tests: ["fe:double_refund_reverts"] },
  { id: "T20", title: "Release before release_at", expected: "TooEarly", tests: ["fe:release_before_time_reverts", "e2e:TooEarly"] },
  { id: "T21", title: "Withdraw more than available / escrow", expected: "only seller_available moves", tests: ["fe:withdraw_never_touches_escrow", "fe:withdraw_nothing_reverts"] },
  { id: "T22", title: "Price change after purchase", expected: "paid passes keep their price", tests: ["fe:update_price_does_not_touch_paid_passes", "fe:refund_pays_what_was_paid_after_price_change"] },
  { id: "T23", title: "Supply reduction below sold", expected: "SupplyBelowSold", tests: ["fe:update_supply_below_sold_reverts"] },
  { id: "T24", title: "Transfer of a redeemed pass", expected: "allowed; stays redeemed", tests: ["fe:redeemed_pass_stays_redeemed_after_transfer"] },
  { id: "T25", title: "Approval abuse: transferFrom by a non-approved account", expected: "NotAuthorized", tests: ["fe:transfer_by_stranger_reverts", "fe:approve_by_stranger_reverts"] },
  { id: "T26", title: "Calling a forbidden handler mid-batch", expected: "ExternalCallInBatch", tests: ["fe:withdraw_in_zero_value_batch_reverts", "fe:refund_in_zero_value_batch_reverts"] },
  { id: "T27", title: "Forced ETH via a self-destructing actor", expected: "books stay covered; Sweep moves only the excess", tests: ["fe:forced_eth_is_sweepable_and_never_breaks_books"] },
  { id: "T28", title: "Selector collisions", expected: "standard ERC-721 selectors; ABI has no duplicates", tests: ["e2e:ERC-721 selectors"] },
  { id: "T29", title: "Zero-quantity buys", expected: "ZeroQuantity", tests: ["fe:buy_zero_qty_reverts"] },
  { id: "T30", title: "Integer extremes (2^256-1 price, qty overflow)", expected: "Panic(0x11) or SoldOut before overflow", tests: ["fe:buy_price_times_qty_overflow_panics", "fe:buy_huge_qty_reverts_sold_out_not_overflow", "fe:charge_qty_overflow_panics_before_drawing", "fe:buy_wei_max_price_needs_wei_max_value"] },
  { id: "T31", title: "Seller self-check-in to unlock escrow", expected: "BadSignature (seller key is not the holder)", tests: ["fe:redeem_wrong_signer_reverts", "e2e:cannot fake a check-in"] },
  { id: "T32", title: "Stale price in the UI", expected: "simulation catches it; 'Refresh prices'", tests: ["ui:stale price"] },
];
