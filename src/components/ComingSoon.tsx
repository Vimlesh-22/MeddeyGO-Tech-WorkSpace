'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Clock, Sparkles, ArrowRight, Bell } from 'lucide-react';

interface ComingSoonProps {
  toolName: string;
  description?: string;
  features?: string[];
  estimatedDate?: string;
  icon?: React.ReactNode;
}

export default function ComingSoon({
  toolName,
  description = "We're working hard to bring you this amazing tool!",
  features = [],
  estimatedDate,
  icon
}: ComingSoonProps) {
  return (
    <div className="min-h-screen bg-linear-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="max-w-3xl w-full"
      >
        {/* Main Card */}
        <div className="bg-white/10 backdrop-blur-lg rounded-3xl shadow-2xl border border-white/20 overflow-hidden">
          {/* Header with Icon */}
          <div className="bg-linear-to-r from-blue-500/20 to-purple-500/20 p-8 text-center">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
              className="inline-flex items-center justify-center w-20 h-20 bg-white/20 backdrop-blur-md rounded-full mb-6"
            >
              {icon || <Sparkles className="w-10 h-10 text-white" />}
            </motion.div>

            <motion.h1
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="text-4xl md:text-5xl font-bold text-white mb-3"
            >
              {toolName}
            </motion.h1>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="inline-flex items-center gap-2 bg-yellow-400/20 backdrop-blur-sm px-4 py-2 rounded-full border border-yellow-400/30"
            >
              <Clock className="w-4 h-4 text-yellow-300" />
              <span className="text-yellow-100 text-sm font-medium">Coming Soon</span>
            </motion.div>
          </div>

          {/* Content */}
          <div className="p-8">
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="text-lg text-gray-200 text-center mb-8"
            >
              {description}
            </motion.p>

            {/* Features List */}
            {features.length > 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="mb-8"
              >
                <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-blue-400" />
                  Upcoming Features
                </h2>
                <ul className="space-y-3">
                  {features.map((feature, index) => (
                    <motion.li
                      key={index}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.7 + index * 0.1 }}
                      className="flex items-start gap-3 text-gray-300"
                    >
                      <ArrowRight className="w-5 h-5 text-blue-400 bg-linear-to-r mt-0.5" />
                      <span>{feature}</span>
                    </motion.li>
                  ))}
                </ul>
              </motion.div>
            )}

            {/* Estimated Date */}
            {estimatedDate && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
                className="text-center bg-blue-500/10 rounded-2xl p-6 border border-blue-400/20"
              >
                <p className="text-gray-300 mb-2">Expected Launch</p>
                <p className="text-2xl font-bold text-white">{estimatedDate}</p>
              </motion.div>
            )}

            {/* Notify Me Button */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.9 }}
              className="mt-8 text-center"
            >
              <button className="inline-flex items-center gap-2 bg-linear-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white font-semibold px-8 py-4 rounded-full transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl">
                <Bell className="w-5 h-5" />
                <span>Notify Me When Available</span>
              </button>
            </motion.div>
          </div>
        </div>

        {/* Back to Dashboard Link */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="text-center mt-6"
        >
          <Link
            href="/"
            className="text-white/60 hover:text-white transition-colors inline-flex items-center gap-2 group"
          >
            <span>← Back to Dashboard</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </motion.div>
      </motion.div>

      {/* Animated Background Elements */}
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
