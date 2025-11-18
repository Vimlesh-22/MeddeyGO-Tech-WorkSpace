'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Wand2, FileSearch, Combine, Receipt, Sparkles, Clock, ArrowRight } from 'lucide-react';
import Link from 'next/link';

const upcomingTools = [
  {
    id: 'ai-seo',
    name: 'AI SEO Strategist',
    description: 'Advanced AI-powered SEO analysis and content optimization',
    icon: Wand2,
    color: 'from-purple-500 to-pink-500',
    link: '/ai-seo',
    eta: 'Q1 2026',
    features: ['AI Keyword Research', 'Content Optimization', 'Competitor Analysis']
  },
  {
    id: 'extractor',
    name: 'Data Extractor Pro',
    description: 'Extract and transform data from various file formats',
    icon: FileSearch,
    color: 'from-blue-500 to-cyan-500',
    link: '/extractor',
    eta: 'Q2 2026',
    features: ['PDF Extraction', 'Batch Processing', 'Data Validation']
  },
  {
    id: 'merger',
    name: 'File Merger',
    description: 'Intelligently merge and consolidate multiple files',
    icon: Combine,
    color: 'from-green-500 to-emerald-500',
    link: '/merger',
    eta: 'Q2 2026',
    features: ['Smart Merging', 'Duplicate Detection', 'Data Integrity']
  },
  {
    id: 'order-extractor',
    name: 'Order ID Extractor',
    description: 'Automated order ID and AWB extraction system',
    icon: Receipt,
    color: 'from-orange-500 to-red-500',
    link: '/order-extractor',
    eta: 'Q1 2026',
    features: ['Email Parsing', 'AWB Detection', 'Order Tracking']
  }
];

export default function ComingSoonPage() {
  return (
    <div className="min-h-screen bg-linear-to-br from-slate-900 via-blue-900 to-slate-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12 pt-8"
        >
          <div className="inline-flex items-center gap-2 bg-yellow-400/20 backdrop-blur-sm px-4 py-2 rounded-full border border-yellow-400/30 mb-6">
            <Clock className="w-4 h-4 text-yellow-300" />
            <span className="text-yellow-100 text-sm font-medium">Coming Soon</span>
          </div>
          
          <h1 className="text-5xl md:text-6xl font-bold text-white mb-4">
            Exciting New Features
          </h1>
          <p className="text-xl text-gray-300 max-w-2xl mx-auto">
            We&apos;re constantly innovating to bring you powerful new tools. Here&apos;s what&apos;s in the pipeline!
          </p>
        </motion.div>

        {/* Tools Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          {upcomingTools.map((tool, index) => (
            <motion.div
              key={tool.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <Link href={tool.link}>
                <div className="group bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 hover:border-white/40 transition-all duration-300 hover:transform hover:scale-105 cursor-pointer h-full">
                  {/* Icon & Title */}
                  <div className="flex items-start justify-between mb-4">
                    <div className={`p-3 rounded-xl bg-linear-to-br ${tool.color} shadow-lg`}>
                      <tool.icon className="w-6 h-6 text-white" />
                    </div>
                    <span className="text-xs text-gray-400 bg-black/20 px-3 py-1 rounded-full">
                      {tool.eta}
                    </span>
                  </div>

                  {/* Content */}
                  <h3 className="text-2xl font-bold text-white mb-2 group-hover:text-blue-300 transition-colors">
                    {tool.name}
                  </h3>
                  <p className="text-gray-300 mb-4">{tool.description}</p>

                  {/* Features */}
                  <div className="space-y-2 mb-4">
                    {tool.features.map((feature, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-sm text-gray-400">
                        <Sparkles className="w-3 h-3 text-blue-400" />
                        <span>{feature}</span>
                      </div>
                    ))}
                  </div>

                  {/* Learn More */}
                  <div className="flex items-center gap-2 text-blue-400 font-medium group-hover:gap-3 transition-all">
                    <span>Learn More</span>
                    <ArrowRight className="w-4 h-4" />
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>

        {/* Call to Action */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="bg-linear-to-r from-blue-500/20 to-purple-500/20 backdrop-blur-lg rounded-2xl p-8 border border-white/20 text-center"
        >
          <h2 className="text-3xl font-bold text-white mb-4">
            Want to Suggest a Feature?
          </h2>
          <p className="text-gray-300 mb-6 max-w-2xl mx-auto">
            We love hearing from our users! If you have ideas for new tools or features, let us know.
          </p>
          <button className="bg-linear-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white font-semibold px-8 py-3 rounded-full transition-all duration-300 transform hover:scale-105 shadow-lg">
            Submit Your Idea
          </button>
        </motion.div>

        {/* Back Link */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="text-center mt-8"
        >
          <Link
            href="/"
            className="text-white/60 hover:text-white transition-colors inline-flex items-center gap-2"
          >
            <span>← Back to Dashboard</span>
          </Link>
        </motion.div>
      </div>

      {/* Background Animation */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            rotate: [0, 90, 0],
          }}
          transition={{
            duration: 20,
            repeat: Infinity,
            ease: "linear"
          }}
          className="absolute -top-1/2 -left-1/2 w-full h-full bg-blue-500/5 rounded-full blur-3xl"
        />
        <motion.div
          animate={{
            scale: [1.2, 1, 1.2],
            rotate: [90, 0, 90],
          }}
          transition={{
            duration: 20,
            repeat: Infinity,
            ease: "linear"
          }}
          className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-purple-500/5 rounded-full blur-3xl"
        />
      </div>
    </div>
  );
}
