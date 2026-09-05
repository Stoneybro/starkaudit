"use client";

import React from 'react';
import { motion } from 'framer-motion';

const steps = [
  {
    num: '01',
    title: 'BLINDED TRANSFER',
    label: '01 / BLINDED TRANSFER',
    body: 'STRK20 privacy pools hide payment amounts and counterparties from chain observers, while keeping settlement fully onchain.',
  },
  {
    num: '02',
    title: 'REGISTRY PROOF',
    label: '02 / TRUSTLESS RECORD',
    body: 'Every private transfer emits a blinded proof to the audit registry, tied to the business address — no self-reporting, no skipping the audit step.',
  },
  {
    num: '03',
    title: 'COMMITTED THRESHOLD',
    label: '03 / COMMITTED THRESHOLD',
    body: 'The registry holds a versioned threshold commitment onchain. The numeric test limit is never published for anyone to read.',
  },
  {
    num: '04',
    title: 'OUTCOME ONLY',
    label: '04 / OUTCOME-ONLY REVEAL',
    body: 'Auditors receive pass, fail and duplicate outcomes with flag badges — never the transaction itself. Privacy is preserved end to end.',
  },
];

export default function HowItWorks() {
  return (
    <section className="py-32 px-6 md:px-12 bg-surface">
      <div className="max-w-6xl mx-auto">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="flex flex-col md:flex-row justify-between items-end mb-24 border-b border-primary pb-8"
        >
          <div>
            <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-outline block mb-4">The Solution</span>
            <h2 className="text-5xl font-bold tracking-tighter uppercase">A trustless, confidential audit layer.</h2>
          </div>
          <div className="hidden md:block text-right">
            <span className="font-mono text-xs opacity-50">DEMO_BUILD: ALFA</span>
          </div>
        </motion.div>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-0 divide-x divide-outline-variant/20 border border-outline-variant/20">
          {steps.map((step, i) => (
            <motion.div 
              key={step.num}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.5, delay: i * 0.1, ease: "easeOut" }}
              className="p-8 hover:bg-surface-container-lowest transition-colors group"
            >
              <motion.div 
                whileHover={{ scale: 1.05, opacity: 0.5 }}
                className="font-mono text-4xl mb-4 opacity-10 group-hover:opacity-100 transition-opacity origin-left"
              >
                {step.num}
              </motion.div>
              <span className="text-[9px] font-bold uppercase tracking-widest text-outline block mb-6">{step.label}</span>
              <h3 className="text-xs font-bold uppercase tracking-widest mb-4">{step.title}</h3>
              <p className="text-sm text-on-surface-variant leading-relaxed">{step.body}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
