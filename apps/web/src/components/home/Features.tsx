"use client";

import React from 'react';
import { motion } from 'framer-motion';

const features = [
  {
    icon: 'link',
    title: 'Nullifier Anchors',
    body: 'Every private transfer emits a nullifier permanently recorded onchain, making double counting and replayed proofs impossible.',
  },
  {
    icon: 'manage_accounts',
    title: 'Outcome-Only Records',
    body: 'Auditors see pass, fail and duplicate outcomes with flag badges. Amounts and counterparties are never part of the published payload.',
  },
  {
    icon: 'pie_chart',
    title: 'Pool-Wide Duplicate Detection',
    body: 'The registry flags replayed nullifiers across the whole privacy pool, catching double submissions no single business could see.',
  },
  {
    icon: 'lock',
    title: 'Committed Test Thresholds',
    body: 'Test limits live onchain only as versioned hash commitments. Businesses cannot game limits they cannot read, and updates are fully auditable.',
  },
  {
    icon: 'bolt',
    title: 'Trustless Records',
    body: 'Proofs are emitted by the pool contract itself during private transfers. Businesses cannot skip the audit step or fabricate reported outcomes.',
  },
  {
    icon: 'shield',
    title: 'Isolated Audit Workspaces',
    body: 'External auditors get a dedicated, read-only portal to review findings, track analytics and monitor threshold commitments.',
  },
];

export default function Features() {
  return (
    <section className="py-32 px-6 md:px-12 bg-surface-container-high overflow-hidden">
      <div className="max-w-6xl mx-auto">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.5 }}
          className="mb-20"
        >
          <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-outline block mb-4">Built for real-world auditing workflows</span>
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight max-w-2xl">Everything an auditor needs. Total privacy for the business.</h2>
        </motion.div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-outline-variant/20 border border-outline-variant/20 mt-12">
          {features.map((f) => (
            <div 
              key={f.title}
              className="bg-surface p-10 flex flex-col justify-between min-h-[280px]"
            >
              <div>
                <span className="material-symbols-outlined text-3xl mb-6 text-on-surface">{f.icon}</span>
                <h3 className="font-bold uppercase text-sm tracking-widest mb-4">{f.title}</h3>
              </div>
              <p className="text-sm text-on-surface-variant">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
