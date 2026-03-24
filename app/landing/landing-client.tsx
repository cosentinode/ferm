"use client"

import React from "react"

import Link from "next/link"
import Image from "next/image"
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ChevronDown, Heart } from "lucide-react"
import {
  ArrowUpRight,
  Check,
  Linkedin,
  Play,
  Sparkles,
  Twitter,
  Youtube,
  Target,
  TrendingUp,
  MessageSquare,
  Mail,
  Star,
  Clock,
} from "lucide-react"

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useSupabase } from "@/components/supabase-provider"
import { motion, useMotionValueEvent, useScroll, useTransform, AnimatePresence } from "framer-motion"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"

const CHROME_EXTENSION_URL =
  "https://chromewebstore.google.com/detail/fermdev-job-loader/akgppdhffcfpeipmapfbgjcmdlkhkfpp"

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters long")
  .regex(/[A-Z]/, "Include at least one uppercase letter")
  .regex(/[a-z]/, "Include at least one lowercase letter")
  .regex(/\d/, "Include at least one number")
  .regex(/[!@#$%^&*()_+[\]{};:'",.<>/?`~\\|-]/, "Include at least one special character")

const signInSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
})

const signUpSchema = z
  .object({
    email: z.string().email("Enter a valid email address"),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords must match",
    path: ["confirmPassword"],
  })

// Decorative leaf/fern SVG shapes for the border frame
function LeafBorderFrame() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">

      {/* =========================================
          LEFT SIDE 
          ========================================= */}

      {/* 1. TOP LEFT: Spider Plant Cluster (Grassy/Fern-like) */}
      <svg className="absolute -top-8 -left-8 w-64 h-64 opacity-40" viewBox="0 0 200 200" style={{ animation: 'gentleSway 7s ease-in-out infinite' }}>
        <path d="M20 20 Q60 80 80 150 Q90 180 85 190 Q70 160 50 100 Q30 50 20 20 Z" fill="rgb(63, 63, 70)" />
        <path d="M20 20 Q60 80 85 190" stroke="rgb(39, 39, 42)" strokeWidth="0.5" fill="none" />
        <path d="M10 30 Q50 90 40 160 Q35 180 30 170 Q45 100 10 30 Z" fill="rgb(52, 52, 59)" />
        <path d="M30 10 Q80 40 120 80 Q140 100 130 110 Q100 80 50 40 Q30 10 30 10 Z" fill="rgb(63, 63, 70)" />
      </svg>

      {/* 2. UPPER LEFT: Trailing Vine (Kept for verticality) */}
      <svg className="absolute top-[15%] -left-6 w-32 h-96 opacity-30" viewBox="0 0 100 400" style={{ animation: 'gentleSway 9s ease-in-out 1s infinite' }}>
        <path d="M20 0 Q40 100 20 200 Q0 300 30 400" stroke="rgb(82, 82, 91)" strokeWidth="1.5" fill="none" />
        <path d="M25 50 Q50 40 60 60 Q50 80 25 70 Z" fill="rgb(63, 63, 70)" />
        <path d="M15 120 Q-10 110 -20 130 Q-10 150 15 140 Z" fill="rgb(52, 52, 59)" transform="translate(10,0)" />
        <path d="M20 220 Q50 210 60 230 Q50 250 20 240 Z" fill="rgb(63, 63, 70)" />
      </svg>

      {/* 3. MID LEFT: REPLACEMENT - "Boston Fern" Explosion 
          Replaces the Elephant Ear with multiple thin fronds fanning out. */}
      <svg className="absolute top-[40%] -left-12 w-64 h-64 opacity-30" viewBox="0 0 200 200" style={{ animation: 'gentleSway 8s ease-in-out 2s infinite' }}>
        {/* Frond 1 (Up) */}
        <path d="M0 100 Q40 50 90 30" stroke="rgb(82, 82, 91)" strokeWidth="1" fill="none" />
        {[...Array(6)].map((_, i) => (
           <path key={`f1-${i}`} d={`M${15 + i*10} ${85 - i*8} L${25 + i*10} ${75 - i*10}`} stroke="rgb(63, 63, 70)" strokeWidth="2" strokeLinecap="round" />
        ))}
        
        {/* Frond 2 (Middle) */}
        <path d="M0 100 Q60 100 130 90" stroke="rgb(82, 82, 91)" strokeWidth="1" fill="none" />
        {[...Array(8)].map((_, i) => (
           <path key={`f2-${i}`} d={`M${20 + i*12} ${100 - i*1} L${20 + i*12} ${85 - i*1}`} stroke="rgb(63, 63, 70)" strokeWidth="2" strokeLinecap="round" />
        ))}

        {/* Frond 3 (Down) */}
        <path d="M0 100 Q50 140 110 170" stroke="rgb(82, 82, 91)" strokeWidth="1" fill="none" />
        {[...Array(6)].map((_, i) => (
           <path key={`f3-${i}`} d={`M${20 + i*12} ${115 + i*8} L${25 + i*12} ${130 + i*8}`} stroke="rgb(52, 52, 59)" strokeWidth="2" strokeLinecap="round" />
        ))}
      </svg>

      {/* 4. LOWER LEFT: Rising Sword Ferns */}
      <svg className="absolute top-[70%] -left-4 w-32 h-64 opacity-30" viewBox="0 0 100 200" style={{ animation: 'gentleSway 10s ease-in-out 0.5s infinite' }}>
        {[...Array(5)].map((_, i) => (
          <path key={i} 
                d={`M10 200 Q${20 + i*10} ${150 - i*20} ${80} ${100 - i*15}`} 
                stroke="rgb(63, 63, 70)" 
                strokeWidth={3 - i*0.4} 
                strokeLinecap="round" 
                fill="none" 
          />
        ))}
      </svg>

      {/* 5. BOTTOM LEFT CORNER: Dense Bush */}
      <svg className="absolute -bottom-8 -left-8 w-64 h-64 opacity-45" viewBox="0 0 250 250" style={{ animation: 'gentleSway 5s ease-in-out 0.2s infinite' }}>
        <path d="M30 30 Q60 80 80 130 Q100 180 70 230 Q90 170 75 110 Q60 60 30 30 Z" fill="rgb(63, 63, 70)" />
        <path d="M0 100 Q40 120 80 110 Q120 100 140 130 Q100 110 60 115 Z" fill="rgb(52, 52, 59)" opacity="0.8" />
        <path d="M50 200 Q90 190 120 220 Q80 230 40 240 Z" fill="rgb(63, 63, 70)" />
      </svg>


      {/* =========================================
          RIGHT SIDE (More Ferns, More Volume)
          ========================================= */}

      {/* 1A. NEW: TOP RIGHT BACKGROUND CLUSTER 
          Adds volume behind the ivy. Darker, denser fern fronds. */}
      <svg className="absolute -top-4 -right-4 w-64 h-64 opacity-20" viewBox="0 0 200 200" style={{ animation: 'gentleSway 8s ease-in-out 2s infinite' }}>
         <path d="M200 0 Q150 50 100 80" stroke="rgb(52, 52, 59)" strokeWidth="2" fill="none" />
         <path d="M200 0 Q180 80 160 140" stroke="rgb(52, 52, 59)" strokeWidth="2" fill="none" />
         <path d="M200 0 Q120 20 80 40" stroke="rgb(52, 52, 59)" strokeWidth="2" fill="none" />
         {/* Abstract leaf texture on these lines */}
         <path d="M120 40 L110 60 M130 30 L120 50 M140 20 L130 40" stroke="rgb(52, 52, 59)" strokeWidth="1" />
         <path d="M160 100 L140 110 M170 70 L150 80" stroke="rgb(52, 52, 59)" strokeWidth="1" />
      </svg>

      {/* 1B. TOP RIGHT: Dense Hanging Ivy 
          Slightly adjusted to overlap the background fern. */}
      <svg className="absolute -top-10 right-[5%] w-32 h-80 opacity-30" viewBox="0 0 100 300" style={{ animation: 'gentleSway 9s ease-in-out infinite' }}>
        <path d="M50 0 Q60 100 40 200 Q20 250 40 300" stroke="rgb(82, 82, 91)" strokeWidth="1" fill="none" />
        <path d="M55 40 Q80 50 90 70 Q60 80 55 40 Z" fill="rgb(63, 63, 70)" />
        <path d="M55 40 Q75 60 90 70" stroke="rgb(39, 39, 42)" strokeWidth="0.5" fill="none" />
        <path d="M52 100 Q20 110 10 130 Q40 140 52 100 Z" fill="rgb(52, 52, 59)" />
        <path d="M45 160 Q70 170 80 190 Q50 200 45 160 Z" fill="rgb(63, 63, 70)" />
        <path d="M35 240 Q10 250 5 270 Q30 280 35 240 Z" fill="rgb(63, 63, 70)" />
      </svg>

      {/* 2. UPPER RIGHT: Large Frond (Made more fern-like)
          Changed from smooth edges to a jagged/toothed path. */}
      <svg className="absolute top-[10%] -right-12 w-64 h-64 opacity-35" viewBox="0 0 200 200" style={{ animation: 'gentleSway 7s ease-in-out 1.5s infinite' }}>
        <path d="M200 50 Q150 50 100 100 Q50 150 80 180" stroke="rgb(82, 82, 91)" strokeWidth="1" fill="none" />
        {/* Jagged Leaves */}
        <path d="M180 60 L160 80 L140 70 L150 65 Z" fill="rgb(63, 63, 70)" />
        <path d="M160 80 L140 100 L120 90 L130 85 Z" fill="rgb(63, 63, 70)" />
        <path d="M140 100 L120 120 L100 110 L110 105 Z" fill="rgb(63, 63, 70)" />
        <path d="M120 120 L100 140 L80 130 L90 125 Z" fill="rgb(63, 63, 70)" />
      </svg>

      {/* 3. MID RIGHT: Horizontal Fern Branch 
          Replaced broad leaves with a compound fern structure. */}
      <svg className="absolute top-[40%] -right-10 w-64 h-48 opacity-30" viewBox="0 0 250 150" style={{ animation: 'gentleSway 8s ease-in-out 2.5s infinite' }}>
        <path d="M250 75 Q180 75 100 90 Q50 105 20 80" stroke="rgb(82, 82, 91)" strokeWidth="1.5" fill="none" />
        {/* Top small leaves */}
        <path d="M180 75 L170 55 M150 78 L140 58 M120 82 L110 60" stroke="rgb(63, 63, 70)" strokeWidth="3" strokeLinecap="round" />
        {/* Bottom small leaves */}
        <path d="M170 75 L180 95 M140 80 L150 100 M110 85 L120 105" stroke="rgb(63, 63, 70)" strokeWidth="3" strokeLinecap="round" />
        {/* End tuft */}
        <path d="M20 80 Q10 40 40 30 Q50 70 20 80 Z" fill="rgb(52, 52, 59)" />
      </svg>

      {/* 4. LOW RIGHT: Snake Plant (Kept as anchor) */}
      <svg className="absolute top-[65%] -right-4 w-32 h-64 opacity-25" viewBox="0 0 100 250" style={{ animation: 'gentleSway 10s ease-in-out 1s infinite' }}>
        <path d="M90 250 Q100 150 60 50 Q40 100 50 250 Z" fill="rgb(63, 63, 70)" />
        <path d="M70 250 Q75 150 60 50" stroke="rgb(39, 39, 42)" strokeWidth="1" fill="none" />
        <path d="M100 250 Q110 180 30 120 Q50 200 80 250 Z" fill="rgb(52, 52, 59)" opacity="0.8" />
      </svg>

     {/* 4. LOWER RIGHT: Tall "Reed" Grasses
          Matches Left #4 (Sword Ferns) in upward direction and sharpness. */}
      <svg className="absolute top-[68%] -right-6 w-48 h-80 opacity-25" viewBox="0 0 150 300" style={{ animation: 'gentleSway 11s ease-in-out 2s infinite' }}>
        {/* Reed 1 */}
        <path d="M140 300 Q120 150 50 20" stroke="rgb(63, 63, 70)" strokeWidth="2" fill="none" />
        {/* Reed 2 (Thicker) */}
        <path d="M120 300 Q100 200 80 80 Q90 150 120 300 Z" fill="rgb(52, 52, 59)" opacity="0.7" />
        {/* Reed 3 */}
        <path d="M150 300 Q130 180 100 50" stroke="rgb(82, 82, 91)" strokeWidth="1.5" fill="none" />
        {/* Reed 4 */}
        <path d="M100 300 Q80 220 20 120" stroke="rgb(63, 63, 70)" strokeWidth="1" fill="none" />
      </svg>
      {/* 2. UPPER RIGHT: Long Trailing Ivy
          Matches Left #2 (Trailing Vine) in verticality and length. */}
      <svg className="absolute top-[12%] right-[2%] w-24 h-96 opacity-30" viewBox="0 0 60 400" style={{ animation: 'gentleSway 10s ease-in-out 1.5s infinite' }}>
        {/* Vine Stem */}
        <path d="M30 0 Q50 100 20 200 Q0 300 40 400" stroke="rgb(82, 82, 91)" strokeWidth="1" fill="none" />
        {/* Alternating Leaves */}
        <ellipse cx="40" cy="50" rx="8" ry="12" fill="rgb(63, 63, 70)" transform="rotate(20 40 50)" />
        <ellipse cx="15" cy="120" rx="8" ry="12" fill="rgb(52, 52, 59)" transform="rotate(-20 15 120)" />
        <ellipse cx="25" cy="200" rx="9" ry="14" fill="rgb(63, 63, 70)" transform="rotate(10 25 200)" />
        <ellipse cx="35" cy="290" rx="6" ry="10" fill="rgb(52, 52, 59)" transform="rotate(-15 35 290)" />
      </svg>
      <svg className="absolute -top-10 -right-8 w-72 h-72 opacity-40" viewBox="0 0 200 200" style={{ animation: 'gentleSway 7s ease-in-out 0.5s infinite' }}>

        {/* Secondary dark frond */}
        <path d="M190 10 Q150 50 130 100 Q120 140 100 180" stroke="rgb(52, 52, 59)" strokeWidth="4" fill="none" strokeLinecap="round" opacity="0.8" />
        {/* Small branching frond */}
        <path d="M170 30 Q130 50 120 70 Q110 90 80 100" stroke="rgb(82, 82, 91)" strokeWidth="2" fill="none" />
      </svg>
{/* 3. MID RIGHT: Giant Fern Frond "Explosion"
          Matches Left #3 (Boston Fern) in volume and horizontal reach. */}
      <svg className="absolute top-[40%] -right-12 w-80 h-64 opacity-30" viewBox="0 0 300 200" style={{ animation: 'gentleSway 9s ease-in-out 0.2s infinite' }}>
        {/* Main Spine curving INWARD */}
        <path d="M300 100 Q200 100 100 150" stroke="rgb(82, 82, 91)" strokeWidth="1.5" fill="none" />
        
        {/* Complex Fern Leaflets (Top side of spine) */}
        {[...Array(9)].map((_, i) => (
           <path key={`t-${i}`} d={`M${280 - i*20} ${100 + i*2} L${260 - i*20} ${70 + i*5}`} stroke="rgb(63, 63, 70)" strokeWidth="2" strokeLinecap="round" />
        ))}
        {/* Complex Fern Leaflets (Bottom side of spine) */}
        {[...Array(9)].map((_, i) => (
           <path key={`b-${i}`} d={`M${280 - i*20} ${100 + i*2} L${270 - i*20} ${130 + i*5}`} stroke="rgb(52, 52, 59)" strokeWidth="2" strokeLinecap="round" />
        ))}
      </svg>
      {/* 5. BOTTOM RIGHT CORNER: Massive "Palm" Bush
          Matches Left #5 (Dense Bush) in weight and corner anchoring. */}
      <svg className="absolute -bottom-12 -right-12 w-80 h-80 opacity-45" viewBox="0 0 300 300" style={{ animation: 'gentleSway 6s ease-in-out 0.8s infinite' }}>
        {/* Big Broad Leaf (Background) */}
        {/* Main Fanning Palm Leaf (Foreground) */}
        <path d="M300 300 Q200 200 100 120" stroke="rgb(63, 63, 70)" strokeWidth="2" fill="none" />
        <path d="M120 140 L150 80 L140 160 L180 100 L170 180 L220 130" stroke="rgb(63, 63, 70)" strokeWidth="4" strokeLinecap="round" fill="none" />
        {/* Base filler */}
        <circle cx="250" cy="280" r="40" fill="rgb(63, 63, 70)" opacity="0.5" />
      </svg>
      
      <style jsx>{`
        @keyframes gentleSway {
          0%, 100% { transform: rotate(-1deg) translateX(0); }
          50% { transform: rotate(1deg) translateX(2px); }
        }
      `}</style>
    </div>
  )
}

function ExtensionLinkWithGrowingUnderline() {
const leaves = [
    {
      id: 1,
      // Perfect (You liked this one)
      d: "M45 20 Q35 15 38 5 Q48 10 45 20 Z",
      origin: "45px 20px",
      delay: 0.2,
    },
    {
      id: 2,
      // FIXED: Was invisible (y=48). Now points UP and LEFT sharply.
      d: "M120 33 Q110 33 112 18 Q118 25 120 33 Z",
      origin: "120px 33px",
      delay: 0.6,
    },
    {
      id: 3,
      // FIXED: Was a circle. Now a curved thorn pointing RIGHT.
      d: "M200 23 Q200 12 210 10 Q208 20 200 23 Z",
      origin: "200px 23px",
      delay: 0.95,
    },
    {
      id: 4,
      // Perfect (You liked this one)
      d: "M280 29 Q285 20 300 25 Q290 32 280 29 Z",
      origin: "280px 29px",
      delay: 1.3,
    },
  ];

  return (
    <span className="relative inline-block">
      <Link
        href={CHROME_EXTENSION_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="relative z-10 font-semibold text-emerald-400 transition-colors hover:text-emerald-300"
      >
        ferm&apos;s browser extension
      </Link>
      <motion.svg
        className="pointer-events-none absolute -bottom-2 left-0 h-4 w-full"
        viewBox="0 0 320 40"
        preserveAspectRatio="none"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, amount: 0.8 }}
      >
        {/* The Main Vine Stem */}
        <motion.path
          d="M4 26 C40 14, 72 36, 106 24 C146 11, 178 35, 214 24 C250 12, 282 30, 316 20"
          fill="none"
          stroke="rgb(52 211 153)"
          strokeLinecap="round"
          strokeWidth="3"
          initial={{ pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true, amount: 0.8 }}
          transition={{ duration: 1.5, ease: "easeInOut" }}
        />

        {/* The Sharp Leaves */}
        {leaves.map((leaf) => (
          <motion.path
            key={leaf.id}
            d={leaf.d}
            fill="rgb(74 222 128)" 
            stroke="rgb(74 222 128)"
            strokeWidth="1" // Reduced stroke width slightly to enhance sharpness
            initial={{ scale: 0, opacity: 0 }}
            whileInView={{ scale: 1, opacity: 1 }}
            viewport={{ once: true, amount: 0.8 }}
            style={{ transformOrigin: leaf.origin }}
            transition={{
              duration: 0.3, // Slightly faster pop for sharper feel
              delay: leaf.delay,
              type: "spring",
              bounce: 0.6,
            }}
          />
        ))}
      </motion.svg>
    </span>
  )
}
// Full-width decorative fern divider that spans the entire horizontal bar
function SectionFernDecor({ className = "" }: { className?: string }) {
  return (
    // Changed h-full back to a fixed height (h-32 or h-40) so it doesn't explode in size
    <div className={` w-full h-12 opacity-30 overflow-hidden ${className}`}>
      <svg 
        viewBox="0 0 1200 100" 
        className="w-full h-full"
        preserveAspectRatio="none"
      >
        {/* Base soil layer - Starts near top (y=5) */}
        <path 
          d="M0 5 Q50 3 100 7 Q150 4 200 9 Q250 6 300 8 Q350 4 400 11 Q450 7 500 6 Q550 9 600 4 Q650 7 700 6 Q750 9 800 7 Q850 4 900 9 Q950 6 1000 7 Q1050 11 1100 6 Q1150 7 1200 9 L1200 100 L0 100 Z" 
          fill="rgb(82, 82, 91)"
        />
        
        {/* Soil texture - Starts at very top (y=0) */}
        <path 
          d="M0 0 Q50 3 100 0 Q150 2 200 0 Q250 1 300 0 Q350 3 400 0 Q450 1 500 2 Q550 0 600 3 Q650 1 700 2 Q750 0 800 1 Q850 3 900 0 Q950 2 1000 1 Q1050 0 1100 2 Q1150 1 1200 0 L1200 100 L0 100 Z" 
          fill="rgb(63, 63, 70)"
        />
        
        {/* Dirt clumps and particles scattered full height */}
        <circle cx="40" cy="20" r="3" fill="rgb(39, 39, 42)" opacity="0.8" />
        <circle cx="85" cy="85" r="2.2" fill="rgb(39, 39, 42)" opacity="0.7" />
        <circle cx="120" cy="35" r="2.8" fill="rgb(39, 39, 42)" opacity="0.8" />
        <circle cx="165" cy="75" r="2" fill="rgb(39, 39, 42)" opacity="0.6" />
        <circle cx="210" cy="15" r="3.5" fill="rgb(39, 39, 42)" opacity="0.8" />
        <circle cx="245" cy="55" r="2.4" fill="rgb(39, 39, 42)" opacity="0.7" />
        <circle cx="290" cy="90" r="3.2" fill="rgb(39, 39, 42)" opacity="0.8" />
        <circle cx="335" cy="25" r="2.1" fill="rgb(39, 39, 42)" opacity="0.6" />
        <circle cx="380" cy="65" r="2.7" fill="rgb(39, 39, 42)" opacity="0.8" />
        <circle cx="425" cy="10" r="3.3" fill="rgb(39, 39, 42)" opacity="0.7" />
        <circle cx="470" cy="45" r="2.1" fill="rgb(39, 39, 42)" opacity="0.6" />
        <circle cx="515" cy="80" r="2.9" fill="rgb(39, 39, 42)" opacity="0.8" />
        <circle cx="560" cy="30" r="2.4" fill="rgb(39, 39, 42)" opacity="0.7" />
        <circle cx="605" cy="95" r="3.2" fill="rgb(39, 39, 42)" opacity="0.8" />
        <circle cx="650" cy="40" r="2.3" fill="rgb(39, 39, 42)" opacity="0.6" />
        <circle cx="695" cy="15" r="2.8" fill="rgb(39, 39, 42)" opacity="0.8" />
        <circle cx="740" cy="70" r="3.4" fill="rgb(39, 39, 42)" opacity="0.7" />
        <circle cx="785" cy="25" r="2" fill="rgb(39, 39, 42)" opacity="0.6" />
        <circle cx="830" cy="85" r="3.1" fill="rgb(39, 39, 42)" opacity="0.8" />
        <circle cx="875" cy="35" r="2.4" fill="rgb(39, 39, 42)" opacity="0.7" />
        <circle cx="920" cy="12" r="3.3" fill="rgb(39, 39, 42)" opacity="0.8" />
        <circle cx="965" cy="55" r="2.2" fill="rgb(39, 39, 42)" opacity="0.6" />
        <circle cx="1010" cy="92" r="2.9" fill="rgb(39, 39, 42)" opacity="0.8" />
        <circle cx="1055" cy="28" r="2.7" fill="rgb(39, 39, 42)" opacity="0.7" />
        <circle cx="1100" cy="65" r="2.3" fill="rgb(39, 39, 42)" opacity="0.6" />
        <circle cx="1145" cy="15" r="3.2" fill="rgb(39, 39, 42)" opacity="0.8" />
        
        {/* Additional smaller particles for texture */}
        <circle cx="60" cy="10" r="1.5" fill="rgb(39, 39, 42)" opacity="0.5" />
        <circle cx="140" cy="90" r="1.3" fill="rgb(39, 39, 42)" opacity="0.5" />
        <circle cx="220" cy="40" r="1.7" fill="rgb(39, 39, 42)" opacity="0.5" />
        <circle cx="310" cy="15" r="1.4" fill="rgb(39, 39, 42)" opacity="0.5" />
        <circle cx="390" cy="80" r="1.5" fill="rgb(39, 39, 42)" opacity="0.5" />
        <circle cx="490" cy="25" r="1.3" fill="rgb(39, 39, 42)" opacity="0.5" />
        <circle cx="570" cy="60" r="1.7" fill="rgb(39, 39, 42)" opacity="0.5" />
        <circle cx="670" cy="15" r="1.4" fill="rgb(39, 39, 42)" opacity="0.5" />
        <circle cx="760" cy="85" r="1.5" fill="rgb(39, 39, 42)" opacity="0.5" />
        <circle cx="850" cy="30" r="1.3" fill="rgb(39, 39, 42)" opacity="0.5" />
        <circle cx="940" cy="70" r="1.7" fill="rgb(39, 39, 42)" opacity="0.5" />
        <circle cx="1030" cy="20" r="1.4" fill="rgb(39, 39, 42)" opacity="0.5" />
        <circle cx="1120" cy="50" r="1.5" fill="rgb(39, 39, 42)" opacity="0.5" />
        
        {/* Small pebbles/rocks */}
        <ellipse cx="110" cy="25" rx="4" ry="2.5" fill="rgb(82, 82, 91)" opacity="0.9" />
        <ellipse cx="280" cy="85" rx="3.5" ry="2.2" fill="rgb(82, 82, 91)" opacity="0.9" />
        <ellipse cx="450" cy="45" rx="4.2" ry="2.8" fill="rgb(82, 82, 91)" opacity="0.9" />
        <ellipse cx="620" cy="15" rx="3.8" ry="2.4" fill="rgb(82, 82, 91)" opacity="0.9" />
        <ellipse cx="790" cy="65" rx="4.1" ry="2.7" fill="rgb(82, 82, 91)" opacity="0.9" />
        <ellipse cx="960" cy="30" rx="3.6" ry="2.3" fill="rgb(82, 82, 91)" opacity="0.9" />
        <ellipse cx="1130" cy="80" rx="4" ry="2.5" fill="rgb(82, 82, 91)" opacity="0.9" />
      </svg>
    </div>
  )
}

// Full-height section fern that spans from border to border
function SectionFern({ side }: { side: 'left' | 'right' }) {
  const isLeft = side === 'left'
  
  return (
    <div 
      className={`absolute top-0 bottom-0 ${isLeft ? 'left-0' : 'right-0'} w-24 opacity-15 pointer-events-none overflow-hidden`}
      style={{ transform: isLeft ? 'none' : 'scaleX(-1)' }}
    >
      <svg 
        viewBox="0 0 100 500" 
        className="h-full w-full"
        preserveAspectRatio="xMidYMid slice"
      >
        {/* Main stem that spans the full height */}
        <path d="M60 500 Q55 400 58 300 Q62 200 57 100 Q55 50 58 0" stroke="rgb(82, 82, 91)" strokeWidth="2" fill="none" />
        
        {/* Fern fronds at various heights */}
        <path d="M58 480 Q30 465 10 445" stroke="rgb(82, 82, 91)" strokeWidth="1.2" fill="none" />
        <path d="M58 450 Q25 430 5 400" stroke="rgb(82, 82, 91)" strokeWidth="1.2" fill="none" />
        <path d="M58 410 Q30 390 15 360" stroke="rgb(82, 82, 91)" strokeWidth="1.2" fill="none" />
        <path d="M58 370 Q28 345 10 310" stroke="rgb(82, 82, 91)" strokeWidth="1.1" fill="none" />
        <path d="M58 330 Q32 305 18 270" stroke="rgb(82, 82, 91)" strokeWidth="1.1" fill="none" />
        <path d="M58 285 Q30 260 12 225" stroke="rgb(82, 82, 91)" strokeWidth="1" fill="none" />
        <path d="M57 240 Q28 215 10 180" stroke="rgb(82, 82, 91)" strokeWidth="1" fill="none" />
        <path d="M57 195 Q32 170 15 135" stroke="rgb(82, 82, 91)" strokeWidth="0.9" fill="none" />
        <path d="M57 150 Q30 125 18 90" stroke="rgb(82, 82, 91)" strokeWidth="0.9" fill="none" />
        <path d="M58 105 Q35 85 25 55" stroke="rgb(82, 82, 91)" strokeWidth="0.8" fill="none" />
        <path d="M58 65 Q40 50 35 25" stroke="rgb(82, 82, 91)" strokeWidth="0.8" fill="none" />
        
        {/* Leaf shapes */}
        <ellipse cx="18" cy="455" rx="8" ry="14" fill="rgb(63, 63, 70)" opacity="0.6" transform="rotate(-30 18 455)" />
        <ellipse cx="12" cy="410" rx="8" ry="14" fill="rgb(63, 63, 70)" opacity="0.55" transform="rotate(-35 12 410)" />
        <ellipse cx="20" cy="370" rx="7" ry="12" fill="rgb(63, 63, 70)" opacity="0.5" transform="rotate(-28 20 370)" />
        <ellipse cx="15" cy="320" rx="7" ry="13" fill="rgb(63, 63, 70)" opacity="0.5" transform="rotate(-32 15 320)" />
        <ellipse cx="18" cy="270" rx="6" ry="11" fill="rgb(63, 63, 70)" opacity="0.45" transform="rotate(-30 18 270)" />
        <ellipse cx="15" cy="220" rx="6" ry="11" fill="rgb(63, 63, 70)" opacity="0.45" transform="rotate(-35 15 220)" />
        <ellipse cx="18" cy="170" rx="5" ry="10" fill="rgb(63, 63, 70)" opacity="0.4" transform="rotate(-28 18 170)" />
        <ellipse cx="22" cy="125" rx="5" ry="9" fill="rgb(63, 63, 70)" opacity="0.4" transform="rotate(-32 22 125)" />
        <ellipse cx="28" cy="80" rx="4" ry="8" fill="rgb(63, 63, 70)" opacity="0.35" transform="rotate(-35 28 80)" />
        <ellipse cx="38" cy="40" rx="3" ry="6" fill="rgb(63, 63, 70)" opacity="0.3" transform="rotate(-40 38 40)" />
      </svg>
     
    </div>
  )
}

const chromeExtensionPanels = [
  {
    title: "Sign in with Google",
    description: "Authenticate so we know where to send the job details to",
    icon: Target,
    gifSrc: "/gifs/login_ferm_demo.gif",
    gifAlt: "Chrome extension demo showing auth.",
  },
  {
    title: "Click the button",
    description: "No need to wait for processing to finish",
    icon: TrendingUp,
    gifSrc: "/gifs/parsing_job_demo.gif",
    gifAlt: "Chrome extension demo showing button interaction.",
  },
  {
    title: "Check back on platform",
    description: "You'll see all the job info, as well as your position fit score",
    icon: Clock,
    gifSrc: "/gifs/dash_demo.gif",
    gifAlt: "Chrome extension demo showing going back to site.",
  },
] as const



const faqItems = [
  {
    question: "Is ferm free to use?",
    answer:
      "Yes! ferm offers generous free limits that include the premium AI features, you can also bypass any limits entirely by providing your own OpenAI API key. The dream is to open-sourece the project :)",
  },
  {
    question: "Why should I upload my resume?",
    answer:
      "Your resume is used when determining job fit score, along with giving the AI interview prep assistant context on your background to help prepare you for the interview at hand!",
  },
  {
    question: "Is my data secure?",
    answer:
      "Your data is encrypted at rest and in transit. Your information is never shared with third parties, and you can delete your data or account at any time.",
  },
]

const stats = [
  { value: "10+", label: "Active job seekers" },
  { value: "85%", label: "Improved interview readiness" },
  { value: "2.5x", label: "Consistent follow-ups" },
  { value: "100+", label: "Jobs tracked" },
]

const interactiveWords = ["application", "interview", "follow-up", "opportunity"]

const superchargeFeatures = [
  {
    id: "follow-ups",
    title: "Follow-up Emails",
    icon: Mail,
    bentoContent: {
      headline: "Generate polished follow-up drafts in seconds",
      subtext: "Stay consistent after every interview with context-aware follow-up emails that sound natural and personalized.",
      features: [
        { label: "Suggested send time", value: "Next morning" },
        { label: "Tone", value: "Professional + warm" },
        { label: "Custom drafts", value: "Unlimited" },
        { label: "Reply rate lift", value: "+22%" },
      ],
      mediaSrc: "/gifs/login_ferm_demo.gif",
      mediaType: "GIF placeholder",
      screenshotLabel: "Follow-up email preview",
    },
  },
  {
    id: "job-scoring",
    title: "Job Scoring",
    icon: Star,
    bentoContent: {
      headline: "Know your match before you apply",
      subtext: "AI analyzes job requirements against your profile to show compatibility and highlight skill gaps.",
      features: [
        { label: "Match score", value: "87%" },
        { label: "Skills matched", value: "12/14" },
        { label: "Experience fit", value: "Strong" },
        { label: "Culture alignment", value: "High" },
      ],
      mediaSrc: "/gifs/parsing_job_demo.gif",
      mediaType: "GIF placeholder",
      screenshotLabel: "Job scoring dashboard snapshot",
    },
  },
  {
    id: "interview-prep",
    title: "Interview Prep (coming soon)",
    icon: MessageSquare,
    bentoContent: {
      headline: "AI Interview Prep is coming soon",
      subtext: "We are building guided interview practice with tailored questions and instant feedback based on your target role.",
      features: [
        { label: "Role-specific prompts", value: "Planned" },
        { label: "Answer scoring", value: "Planned" },
        { label: "Voice mode", value: "Planned" },
        { label: "Launch", value: "Coming soon" },
      ],
      mediaSrc: "/gifs/dash_demo.gif",
      mediaType: "GIF placeholder",
      screenshotLabel: "Interview prep preview (coming soon)",
    },
  },
]

function SocialLink({ href, label, children }: { href: string; label: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-label={label}
      prefetch={false}
      target="_blank"
      rel="noreferrer"
      className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-all hover:border-foreground/30 hover:bg-muted hover:text-foreground"
    >
      {children}
    </Link>
  )
}

export default function LandingPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectedFrom = searchParams.get("redirectedFrom")
  const { supabase, session, isLoading } = useSupabase()
  const [isSignUpOpen, setIsSignUpOpen] = useState(false)
  const [isLoginOpen, setIsLoginOpen] = useState(false)
  const [isVideoOpen, setIsVideoOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [currentWordIndex, setCurrentWordIndex] = useState(0)
  const [displayedText, setDisplayedText] = useState("")
  const [isDeleting, setIsDeleting] = useState(false)
  const [selectedFeature, setSelectedFeature] = useState<string>("follow-ups")
  const [isHeaderVisible, setIsHeaderVisible] = useState(true)
  const [displayedExtensionGif, setDisplayedExtensionGif] = useState({ panelIndex: 0, version: 0 })
  const [incomingExtensionGif, setIncomingExtensionGif] = useState<{ panelIndex: number; version: number } | null>(null)
  const [displayedFeatureGif, setDisplayedFeatureGif] = useState({ featureId: "follow-ups", version: 0 })
  const [incomingFeatureGif, setIncomingFeatureGif] = useState<{ featureId: string; version: number } | null>(null)
  const lastScrollY = useRef(0)
  const gifVersionRef = useRef(0)

  const getNextGifVersion = () => {
    gifVersionRef.current += 1
    return gifVersionRef.current
  }

  const getExtensionGifSrc = (panelIndex: number, version: number) =>
    `${chromeExtensionPanels[panelIndex].gifSrc}?v=${version}`

  const getFeatureGifSrc = (featureId: string, version: number) => {
    const feature = superchargeFeatures.find((item) => item.id === featureId)
    return feature ? `${feature.bentoContent.mediaSrc}?v=${version}` : ""
  }

  const handleSwitchToSignUp = () => {
    setIsLoginOpen(false)
    setIsSignUpOpen(true)
  }

  const handleSwitchToLogin = () => {
    setIsSignUpOpen(false)
    setIsLoginOpen(true)
  }

  const { scrollY } = useScroll()
  const heroRef = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  })
  const heroY = useTransform(scrollYProgress, [0, 1], [0, 150])
  const heroOpacity = useTransform(scrollYProgress, [0, 0.5], [1, 0])
  const heroScale = useTransform(scrollYProgress, [0, 0.5], [1, 0.95])

  useMotionValueEvent(scrollY, "change", (latest) => {
    if (latest < 8) {
      setIsHeaderVisible(true)
      lastScrollY.current = latest
      return
    }

    if (latest > lastScrollY.current) {
      setIsHeaderVisible(false)
    } else {
      setIsHeaderVisible(true)
    }

    lastScrollY.current = latest
  })

  // Typewriter effect
  useEffect(() => {
    const currentWord = interactiveWords[currentWordIndex]
    const typeSpeed = 80
    const deleteSpeed = 50
    const pauseTime = 1500

    if (!isDeleting && displayedText === currentWord) {
      // Pause before deleting
      const timeout = setTimeout(() => setIsDeleting(true), pauseTime)
      return () => clearTimeout(timeout)
    }

    if (isDeleting && displayedText === "") {
      // Move to next word
      setIsDeleting(false)
      setCurrentWordIndex((prev) => (prev + 1) % interactiveWords.length)
      return
    }

    const timeout = setTimeout(() => {
      if (isDeleting) {
        setDisplayedText(currentWord.slice(0, displayedText.length - 1))
      } else {
        setDisplayedText(currentWord.slice(0, displayedText.length + 1))
      }
    }, isDeleting ? deleteSpeed : typeSpeed)

    return () => clearTimeout(timeout)
  }, [displayedText, isDeleting, currentWordIndex])

  useEffect(() => {
    if (!isLoading && session) {
      router.replace(redirectedFrom || "/")
    }
  }, [isLoading, redirectedFrom, router, session])

  useEffect(() => {
    if (activeIndex === displayedExtensionGif.panelIndex) return

    setIncomingExtensionGif({
      panelIndex: activeIndex,
      version: getNextGifVersion(),
    })
  }, [activeIndex, displayedExtensionGif.panelIndex])

  useEffect(() => {
    if (selectedFeature === displayedFeatureGif.featureId) return

    setIncomingFeatureGif({
      featureId: selectedFeature,
      version: getNextGifVersion(),
    })
  }, [selectedFeature, displayedFeatureGif.featureId])

  const handleGoogle = async () => {
    if (typeof window === "undefined") return

    const origin = window.location.origin
    const next = redirectedFrom ? `?next=${encodeURIComponent(redirectedFrom)}` : ""

    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${origin}/auth/callback${next}`,
      },
    })
  }

  const hasSession = Boolean(session)
  const baseRedirectUrl = useMemo(() => {
    if (typeof window === "undefined") return ""
    return `${window.location.origin}/auth/callback`
  }, [])

  return (
    <div className="dark">
      <div className="min-h-screen bg-background text-foreground">
        {/* Header */}
        <motion.header
          className={`fixed top-4 left-0 right-0 z-50 flex justify-center px-4 ${
            isHeaderVisible ? "pointer-events-auto" : "pointer-events-none"
          }`}
          animate={{ y: isHeaderVisible ? 0 : -120, opacity: isHeaderVisible ? 1 : 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
        >
          <div className="flex w-full max-w-7xl items-center justify-between rounded-2xl border border-border/60 bg-background/80 px-6 py-3 shadow-lg shadow-black/10 backdrop-blur-xl">
            <Link href="/" className="flex items-center">
              <span className="sr-only">ferm</span>
              <Image
                src="/logo.png"
                alt="public slash logo dot"
                width={32}
                height={32}
                className="h-8 w-8"
                priority
              />
            </Link>
            <div className="flex items-center gap-3">
              {hasSession ? (
                <Button
                  variant="ghost"
                  onClick={() => router.replace(redirectedFrom || "/")}
                  className="rounded-full text-muted-foreground"
                >
                  Go to dashboard
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  onClick={() => setIsSignUpOpen(true)}
                  className="rounded-full text-muted-foreground"
                >
                  Create an account
                </Button>
              )}
              {hasSession ? (
                <Button onClick={() => router.replace(redirectedFrom || "/")} className="gap-2 rounded-full">
                  Open ferm
                  <ArrowUpRight className="h-4 w-4" aria-hidden />
                </Button>
              ) : (
                <Button onClick={() => setIsLoginOpen(true)} className="gap-2 rounded-full">
                  Sign in
                  <ArrowUpRight className="h-4 w-4" aria-hidden />
                </Button>
              )}
            </div>
          </div>
        </motion.header>

        {/* Hero Section - Centered with static fern plants at bottom */}
        <section ref={heroRef} className="relative overflow-hidden pt-24 bg-zinc-900">
          {/* Subtle forest floor texture overlay */}
          <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 400 400\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noiseFilter\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilter)\'/%3E%3C/svg%3E")' }} />
          
          <motion.div
            style={{ y: heroY, opacity: heroOpacity, scale: heroScale }}
            className="relative mx-auto max-w-6xl px-6 py-20 lg:py-32"
          >
            {/* Centered hero content */}
            <div className="flex flex-col items-center text-center gap-8 relative z-10">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/50 px-4 py-2 text-sm font-medium text-foreground"
              >
                <Sparkles className="h-4 w-4" />
                AI-powered Interview Prep Coming Soon!
              </motion.div>
              <motion.h1
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.1 }}
                className="text-balance text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl max-w-4xl"
              >
                Stop forgetting where every{" "}
                <span className="relative inline-block min-w-[200px]">
                  <span className="border-b-2 border-foreground">
                    {displayedText}
                  </span>
                  <motion.span
                    animate={{ opacity: [1, 0] }}
                    transition={{ duration: 0.5, repeat: Infinity, repeatType: "reverse" }}
                    className="inline-block w-0.5 h-[1em] bg-foreground ml-0.5 align-middle"
                  />
                </span>{" "}
                stands
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="max-w-2xl text-lg leading-relaxed text-muted-foreground"
              >
                ferm centralizes the process of managing your job hunt journey, embracing simplicity without another spreadsheet
              </motion.p>
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.3 }}
                className="flex flex-wrap items-center justify-center gap-4"
              >
                <Button size="lg" className="gap-2 px-8" onClick={() => setIsLoginOpen(true)}>
                  Get started, it&apos;s free!
                  <ArrowUpRight className="h-4 w-4" aria-hidden />
                </Button>
               <Button size="lg" variant="outline" asChild className="gap-2 bg-transparent">
                
  <Link href="https://ko-fi.com/adriancosentino" target="_blank" rel="noreferrer">
    Support Me
    <Heart className="w-4 h-4 text-gray-500 opacity-50" /> 
  </Link>
  
</Button>
              </motion.div>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.5 }}
                className="flex items-center justify-center gap-6 pt-4 text-muted-foreground"
              >
                <SocialLink href="https://www.linkedin.com/company/111001355" label="LinkedIn">
                  <Linkedin className="h-5 w-5" aria-hidden />
                </SocialLink>
                <SocialLink href="https://www.youtube.com/@ferm-dot-dev" label="Youtube">
                  <Youtube className="h-5 w-5" aria-hidden />
                </SocialLink>
                <SocialLink href="https://x.com/fermdotdev" label="Twitter">
                  <Twitter className="h-5 w-5" aria-hidden />
                </SocialLink>
              </motion.div>
            </div>
          </motion.div>
          {/* Leaf Border Frame surrounding the hero */}
          <LeafBorderFrame />
        </section>

        {/* Stats Banner - Marquee (dark gray) */}
        <section className="border-y border-border bg-zinc-900 overflow-hidden">
          <div className="py-8">
            <div className="relative flex overflow-hidden">
              {/* Gradient masks for smooth fade */}
              <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-24 z-10 bg-gradient-to-r from-zinc-900 to-transparent" />
              <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-24 z-10 bg-gradient-to-l from-zinc-900 to-transparent" />
              
              {/* Marquee animation */}
              <motion.div
                className="flex gap-16 pr-16"
                animate={{ x: ["0%", "-50%"] }}
                transition={{
                  x: {
                    repeat: Infinity,
                    repeatType: "loop",
                    duration: 20,
                    ease: "linear",
                  },
                }}
              >
                {/* Double the stats for seamless loop */}
                {[...stats, ...stats, ...stats, ...stats].map((stat, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-4 whitespace-nowrap"
                  >
                    <span className="text-3xl font-bold text-foreground sm:text-4xl">{stat.value}</span>
                    <span className="text-sm text-muted-foreground">{stat.label}</span>
                    <span className="text-muted-foreground/30 text-2xl">{"\u2022"}</span>
                  </div>
                ))}
              </motion.div>
            </div>
          </div>
        </section>

        {/* Chrome Extension Section - Tabbed cards with preview (darker gray) */}
        <section id="chrome-extension" className="py-24 bg-zinc-800 relative overflow-hidden">
          {/* Full-height fern on left (Section 1) */}
          <SectionFern side="left" />
          <SectionFern side="right" />
          <div className="mx-auto max-w-6xl px-6">
            <div className="mb-12 max-w-2xl">
           
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Capture opportunities instantly
              </h2>
              <p className="mt-4 text-lg text-muted-foreground">
                <ExtensionLinkWithGrowingUnderline /> makes job tracking quick and easy! Just sign in, click the magic button, and let it work
              </p>
            </div>

            <div className="grid gap-8 lg:grid-cols-[1fr_1.5fr] lg:items-start">
                {/* Feature tabs - Vertical stacked cards */}
                <div className="grid gap-3 lg:h-[480px] lg:grid-rows-3">
                {chromeExtensionPanels.map((panel, index) => {
                  const isActive = index === activeIndex

                  return (
                    <button
                      key={panel.title}
                      type="button"
                      onClick={() => setActiveIndex(index)}
                      className={`group relative flex h-full overflow-hidden rounded-xl border p-5 text-left transition-all duration-300 ${
                        isActive
                          ? "border-foreground/30 bg-muted shadow-lg"
                          : "border-border bg-card hover:border-foreground/20 hover:bg-card/80"
                      }`}
                    >
                      <div className="flex items-start gap-4">
                        <span
                          className={`shrink-0 text-base font-semibold sm:text-lg ${
                            isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
                          }`}
                        >
                          {index + 1})
                        </span>
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-foreground sm:text-xl">{panel.title}</h3>
                          <p className="pt-3 mt-1 text-base text-muted-foreground">{panel.description}</p>
                        </div>
                        <ChevronDown
                          className={`h-5 w-5 text-muted-foreground transition-transform ${isActive ? "-rotate-90 text-foreground" : ""}`}
                        />
                      </div>
                    </button>
                  )
                })}
                </div>

                {/* Preview area - Browser mockup */}
                <div className="relative lg:h-[480px]">
                  <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
                    <div className="flex h-12 items-center gap-2 border-b border-border bg-muted/50 px-4">
                      <div className="flex gap-2">
                        <div className="h-3 w-3 rounded-full bg-red-500/70" />
                        <div className="h-3 w-3 rounded-full bg-yellow-500/70" />
                        <div className="h-3 w-3 rounded-full bg-green-500/70" />
                      </div>
                      <div className="ml-4 flex-1 rounded-lg bg-background/50 px-4 py-1.5 text-xs text-muted-foreground">
                        workday.com/jobs/view/...
                      </div>
                    </div>
                    <div className="relative flex-1 bg-black/30">
                      <Image
                        key={`extension-${displayedExtensionGif.panelIndex}-${displayedExtensionGif.version}`}
                        src={getExtensionGifSrc(displayedExtensionGif.panelIndex, displayedExtensionGif.version)}
                        alt={chromeExtensionPanels[displayedExtensionGif.panelIndex].gifAlt}
                        fill
                        className="object-cover"
                        sizes=""
                        unoptimized
                      />
                      {incomingExtensionGif ? (
                        <Image
                          key={`incoming-extension-${incomingExtensionGif.panelIndex}-${incomingExtensionGif.version}`}
                          src={getExtensionGifSrc(incomingExtensionGif.panelIndex, incomingExtensionGif.version)}
                          alt={chromeExtensionPanels[incomingExtensionGif.panelIndex].gifAlt}
                          fill
                          className="object-cover"
                          sizes=""
                          unoptimized
                          onLoad={() => {
                            setDisplayedExtensionGif(incomingExtensionGif)
                            setIncomingExtensionGif(null)
                          }}
                        />
                      ) : null}
                    </div>
                  </div>
                  {/* Floating badge */}
                 
                </div>
              </div>
          </div>
        </section>

        {/* Fern section divider */}
        <SectionFernDecor className="py-2 bg-zinc-700" />

        {/* AI Section - Clickable feature cards with bento expansion (dark gray) */}
        <section id="features" className="border-y border-border bg-zinc-900 py-24 relative overflow-hidden">
          {/* Full-height fern on right (Section 2) */}
          <SectionFern side="right" />
          <SectionFern side="left" />
          <div className="mx-auto max-w-6xl px-6">
            <div className="mb-12 text-center">
           
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Supercharge your job search with AI
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
                Let AI handle the tedious parts so you can focus on landing your dream job.
              </p>
            </div>

            {/* Feature selector (individual bordered containers) */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {superchargeFeatures.map((feature) => {
                const Icon = feature.icon
                const isSelected = selectedFeature === feature.id

                return (
                  <button
                    key={feature.id}
                    type="button"
                    onClick={() => setSelectedFeature(feature.id)}
                    className={`group flex items-center gap-3 rounded-xl border px-5 py-4 text-left transition-all duration-200 ${
                      isSelected
                        ? "border-foreground/40 bg-muted/50 text-foreground shadow-md"
                        : "border-border bg-card/40 text-muted-foreground hover:border-foreground/20 hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    <h3 className="font-semibold">{feature.title}</h3>
                  </button>
                )
              })}
            </div>

              {/* Expanded Bento Content - Always visible, smooth transition between features */}
              <div className="mt-6">
                <AnimatePresence mode="popLayout">
                  <motion.div
                    key={selectedFeature}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                  >
                    {(() => {
                      const feature = superchargeFeatures.find(f => f.id === selectedFeature)
                      if (!feature) return null
                      return (
                        <div className="rounded-3xl border border-border bg-card p-8">
                          <div>
                            <h3 className="text-2xl font-bold text-foreground">
                              {feature.bentoContent.headline}
                            </h3>
                            <p className="mt-3 text-muted-foreground">
                              {feature.bentoContent.subtext}
                            </p>
                          </div>

                          {/* Screenshot area - image container only */}
                          <div className="mt-8 overflow-hidden rounded-2xl border border-border/50 bg-muted/20 p-4">
                            <div className="relative aspect-[21/9] overflow-hidden rounded-xl border border-border/50 bg-zinc-900/60">
                              <Image
                                key={`feature-${displayedFeatureGif.featureId}-${displayedFeatureGif.version}`}
                                src={getFeatureGifSrc(displayedFeatureGif.featureId, displayedFeatureGif.version)}
                                alt={
                                  superchargeFeatures.find((item) => item.id === displayedFeatureGif.featureId)?.bentoContent
                                    .screenshotLabel ?? feature.bentoContent.screenshotLabel
                                }
                                fill
                                className="object-cover"
                                unoptimized
                              />
                              {incomingFeatureGif ? (
                                <Image
                                  key={`incoming-feature-${incomingFeatureGif.featureId}-${incomingFeatureGif.version}`}
                                  src={getFeatureGifSrc(incomingFeatureGif.featureId, incomingFeatureGif.version)}
                                  alt={
                                    superchargeFeatures.find((item) => item.id === incomingFeatureGif.featureId)?.bentoContent
                                      .screenshotLabel ?? feature.bentoContent.screenshotLabel
                                  }
                                  fill
                                  className="object-cover"
                                  unoptimized
                                  onLoad={() => {
                                    setDisplayedFeatureGif(incomingFeatureGif)
                                    setIncomingFeatureGif(null)
                                  }}
                                />
                              ) : null}
                              <div className="absolute right-3 top-3 rounded-full border border-white/20 bg-black/50 px-3 py-1 text-xs font-medium text-white">
                                {feature.bentoContent.mediaType} — replace when ready
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })()}
                  </motion.div>
                </AnimatePresence>
              </div>
          </div>
        </section>

        {/* Fern section divider */}
        <SectionFernDecor className="py-2 bg-zinc-700" />

        {/* Definition Section - Dictionary style (clean, no container) */}
        <section className="py-24 bg-zinc-800 relative overflow-hidden">
          {/* Full-height fern on left (Section 3) */}
          <SectionFern side="left" />
          <SectionFern side="right" />
          <div className="mx-auto max-w-3xl px-6">
            <div className="flex flex-wrap items-baseline gap-4 mb-2">
              <h2 className="text-5xl sm:text-6xl font-serif font-bold tracking-tight text-foreground">ferm</h2>
              <span className="text-lg text-muted-foreground italic">/f3ːrm/</span>
              <span className="rounded border border-muted-foreground/50 px-2 py-0.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">noun</span>
            </div>
            <p className="text-sm text-muted-foreground mb-8">also fer·m | fer-m | free-permanently</p>
            <div className="border-t border-border mb-8" />
            <div className="space-y-6">
              <div className="flex gap-4">
                <span className="text-zinc-400 font-medium">1</span>
                <div>
                  <p className="text-foreground">
                    <span className="font-semibold text-zinc-400">User-First Philosophy:</span>{" "}
                    Guaranteed privacy and no paywalls... every detail is curated for a premium, simplistic experience
                  </p>
                </div>
              </div>
              <div className="flex gap-4">
                <span className="text-zinc-400 font-medium">2</span>
                <div>
                  <p className="text-foreground">
                    <span className="font-semibold text-zinc-400">Compounding Efforts:</span>{" "}
                    One follow-up or interview prep per day is all it takes to get closer to being the 1%
                  </p>
                </div>
              </div>
            </div>
           <div className="mt-12 py-6 border-t border-border">
  <p className="text-lg italic text-zinc-400">
    &ldquo;Luck isn’t a result of pure coincidence. It’s an underlying element that reaches only those who move on their will.&rdquo;
  </p>
</div>
          </div>
        </section>

        {/* Fern section divider */}
        <SectionFernDecor className="py-2 bg-zinc-700" />

        {/* FAQ Section - Two column layout with decorative elements (dark gray) */}
        <section id="faq" className="py-24 bg-zinc-900 relative overflow-hidden">
          {/* Full-height fern on right (Section 4) */}
          <SectionFern side="left" />
          <SectionFern side="right" />
          <div className="mx-auto max-w-6xl px-6">
            <div className="grid gap-12 lg:grid-cols-[1fr_1.5fr] lg:items-center">
              <div className="lg:self-center">
                <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                  Frequently asked questions
                </h2>
                <p className="mt-4 text-lg text-muted-foreground">
                  Can&apos;t find what you&apos;re looking for?
                </p>
                <Button variant="outline" className="mt-6 gap-2 bg-transparent" asChild>
                  <Link href="mailto:adrian@ferm.dev">
                    Get in touch
                    <ArrowUpRight className="h-4 w-4" aria-hidden />
                  </Link>
                </Button>
              </div>

              <div className="rounded-2xl border border-border bg-card/50 p-6">
                <Accordion type="single" collapsible className="space-y-4">
                  {faqItems.map((item, index) => (
                    <AccordionItem
                      key={index}
                      value={`faq-item-${index}`}
                      className="rounded-xl border border-border bg-background px-6 last:border-b data-[state=open]:border-foreground/30 data-[state=open]:bg-muted/30"
                    >
                      <AccordionTrigger className="py-4 text-left font-medium hover:no-underline">
                        {item.question}
                      </AccordionTrigger>
                      <AccordionContent className="pb-4 text-muted-foreground">
                        {item.answer}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
            </div>
          </div>
        </section>

        {/* Fern section divider */}
        <SectionFernDecor className="py-2 bg-zinc-700" />
                  
        {/* CTA Section - Full width gradient (darker gray) */}
        <section className="border-y border-border bg-zinc-800 py-20 relative overflow-hidden">
          <SectionFern side="left" />
          <SectionFern side="right" />
          {/* Full-height fern on left (Section 5) */}
          <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 px-6 text-center">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Ready to track simple?
              </h2>
              <p className="max-w-2xl text-lg text-muted-foreground">
                Create an account for free and take control today.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-4">
<div className="relative group overflow-hidden rounded-lg p-[4px]"> 
  <div className="absolute inset-[-1000%] animate-[spin_3s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,#000000_0%,#50C878_50%,#000000_100%)]" />

  <Button
    size="lg"
    className="relative z-10 w-full h-full rounded-lg bg-white px-8 py-2 text-slate-900 hover:bg-gray-50 transition-colors shadow-sm"
    onClick={() => setIsLoginOpen(true)}
  >
    Get Started Free
  </Button>
</div>
                <Button size="lg" variant="outline" onClick={() => setIsVideoOpen(true)} className="gap-2 bg-transparent">
                  <Play className="h-4 w-4" />
                  Watch Demo
                </Button>
              </div>
          </div>
        </section>

         <SectionFernDecor className="py-2 bg-zinc-700" />
        {/* Footer - Modern minimal (dark gray) */}
        <footer className="border-t border-border bg-zinc-900 py-16 relative overflow-hidden">
          {/* Decorative fern spray at bottom */}
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 flex gap-8 opacity-10 pointer-events-none">
            <svg viewBox="0 0 60 80" className="w-10 h-16" style={{ animation: 'gentleSway 5s ease-in-out infinite' }}>
              <path d="M30 80 Q28 50 30 25 Q32 10 30 0" stroke="rgb(82, 82, 91)" strokeWidth="1" fill="none" />
              <path d="M30 60 Q18 52 10 42" stroke="rgb(82, 82, 91)" strokeWidth="0.8" fill="none" />
              <path d="M30 40 Q15 30 8 18" stroke="rgb(82, 82, 91)" strokeWidth="0.8" fill="none" />
            </svg>
            <svg viewBox="0 0 60 80" className="w-12 h-20" style={{ animation: 'gentleSway 4.5s ease-in-out 0.2s infinite' }}>
              <path d="M30 80 Q28 50 30 25 Q32 10 30 0" stroke="rgb(82, 82, 91)" strokeWidth="1" fill="none" />
              <path d="M30 60 Q18 52 10 42" stroke="rgb(82, 82, 91)" strokeWidth="0.8" fill="none" />
              <path d="M30 40 Q15 30 8 18" stroke="rgb(82, 82, 91)" strokeWidth="0.8" fill="none" />
            </svg>
            <svg viewBox="0 0 60 80" className="w-10 h-16" style={{ transform: 'scaleX(-1)', animation: 'gentleSway 5.2s ease-in-out 0.4s infinite' }}>
              <path d="M30 80 Q28 50 30 25 Q32 10 30 0" stroke="rgb(82, 82, 91)" strokeWidth="1" fill="none" />
              <path d="M30 60 Q18 52 10 42" stroke="rgb(82, 82, 91)" strokeWidth="0.8" fill="none" />
              <path d="M30 40 Q15 30 8 18" stroke="rgb(82, 82, 91)" strokeWidth="0.8" fill="none" />
            </svg>
          </div>
          <div className="mx-auto max-w-6xl px-6">
              <div className="flex flex-col gap-12 md:flex-row md:items-stretch md:justify-between">
                <div className="flex h-full flex-col justify-between gap-12">
                  <Link href="/" className="flex items-center gap-2 text-lg font-bold">
                    <Image
                      src="/logo.png"
                      alt="public slash logo dot"
                      width={32}
                      height={32}
                      className="h-10 w-10"
                    />
                  </Link>

                  <div className="flex items-center gap-4">
                    <SocialLink href="https://www.linkedin.com/company/111001355" label="LinkedIn">
                      <Linkedin className="h-5 w-5" aria-hidden />
                    </SocialLink>
                    <SocialLink href="https://www.youtube.com/@ferm-dot-dev" label="Youtube">
                      <Youtube className="h-5 w-5" aria-hidden />
                    </SocialLink>
                    <SocialLink href="https://x.com/fermdotdev" label="Twitter">
                      <Twitter className="h-5 w-5" aria-hidden />
                    </SocialLink>
                  </div>
                </div>

                <div className="grid gap-12 sm:grid-cols-2 md:ml-auto md:text-right">
                  <div>
                    <h4 className="font-semibold text-foreground">Product</h4>
                    <ul className="mt-4 space-y-3 text-sm">
                      <li><Link href="#features" className="text-muted-foreground transition-colors hover:text-foreground">Features</Link></li>
                      <li><Link href="#faq" className="text-muted-foreground transition-colors hover:text-foreground">Pricing</Link></li>
                      <li><Link href="#chrome-extension" className="text-muted-foreground transition-colors hover:text-foreground">Chrome Extension</Link></li>
                     
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-semibold text-foreground">Company</h4>
                    <ul className="mt-4 space-y-3 text-sm">
                      <li><Link href="https://ferm.dev/about" target="_blank" className="text-muted-foreground transition-colors hover:text-foreground">About</Link></li>
                      <li><Link href="https://ferm.dev/privacy" target="_blank" className="text-muted-foreground transition-colors hover:text-foreground">Privacy</Link></li>
                      <li><Link href="https://ferm.dev/terms" target="_blank" className="text-muted-foreground transition-colors hover:text-foreground">Terms</Link></li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex flex-col items-center justify-between gap-4 border-t border-border pt-8 md:flex-row">
                <p className="text-sm text-muted-foreground">
                  &copy; {new Date().getFullYear()} ferm. All rights reserved.
                </p>
                <p className="text-sm text-muted-foreground">
                  Made with care for job seekers everywhere
                </p>
              </div>
            </div>
        </footer>
      </div>

      <SignUpDialog
        open={isSignUpOpen && !hasSession}
        onOpenChange={setIsSignUpOpen}
        onSwitchToLogin={handleSwitchToLogin}
        supabaseRedirectUrl={baseRedirectUrl}
      />
      <LoginDialog
        open={isLoginOpen && !hasSession}
        onOpenChange={setIsLoginOpen}
        onGoogleSignIn={handleGoogle}
        onSwitchToSignUp={handleSwitchToSignUp}
      />

      {/* Video Dialog */}
      <Dialog open={isVideoOpen} onOpenChange={setIsVideoOpen}>
        <DialogContent
          className="w-[90vw] max-w-6xl overflow-hidden border-border p-0 sm:max-w-[1100px]"
          style={{ maxHeight: "90vh" }}
        >
          <div className="relative aspect-video w-full bg-card">
            <div className="flex h-full items-center justify-center">
              <p className="text-muted-foreground">Video player placeholder</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SignUpDialog({
  open,
  onOpenChange,
  onSwitchToLogin,
  supabaseRedirectUrl,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
  onSwitchToLogin: () => void
  supabaseRedirectUrl: string
}) {
  const { supabase } = useSupabase()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const form = useForm<z.infer<typeof signUpSchema>>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      email: "",
      password: "",
      confirmPassword: "",
    },
  })

  const isSubmitting = form.formState.isSubmitting
  const passwordValue = form.watch("password")
  const confirmValue = form.watch("confirmPassword")

  const hasMinLength = passwordValue.length >= 8
  const hasUppercase = /[A-Z]/.test(passwordValue)
  const hasLowercase = /[a-z]/.test(passwordValue)
  const hasCaseMix = hasUppercase && hasLowercase
  const hasNumber = /\d/.test(passwordValue)
  const hasSpecial = /[!@#$%^&*()_+[\]{};:'",.<>/?`~\\|-]/.test(passwordValue)
  const meetsAllRequirements = hasMinLength && hasCaseMix && hasNumber && hasSpecial
  const passwordsMatch = confirmValue.length > 0 && confirmValue === passwordValue

  const handleSubmit = async (values: z.infer<typeof signUpSchema>) => {
    setSubmitError(null)

    const { data, error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: supabaseRedirectUrl
        ? {
            emailRedirectTo: supabaseRedirectUrl,
          }
        : undefined,
    })

    if (data?.user?.identities?.length === 0) {
      setSubmitError("An account with this email already exists. Please sign in instead.")
      return
    }

    if (error) {
      setSubmitError(error.message)
      return
    }

    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
     

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" autoComplete="email" placeholder="you@example.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      autoComplete="new-password"
                      placeholder="Create a strong password"
                      className={
                        meetsAllRequirements
                          ? "border-emerald-500 focus-visible:border-emerald-500 focus-visible:ring-emerald-500/50"
                          : undefined
                      }
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                  <div className="text-left text-sm text-muted-foreground">
                    <p className="font-medium text-foreground">Password requirements</p>
                    <ul className="mt-2 space-y-1">
                      <RequirementRow met={hasMinLength} label="At least 8 characters long" />
                      <RequirementRow met={hasCaseMix} label="Contains uppercase and lowercase letters" />
                      <RequirementRow met={hasNumber} label="Includes a number" />
                      <RequirementRow met={hasSpecial} label="Includes a special character" />
                    </ul>
                  </div>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm password</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      autoComplete="new-password"
                      placeholder="Re-enter your password"
                      className={
                        passwordsMatch
                          ? "border-emerald-500 focus-visible:border-emerald-500 focus-visible:ring-emerald-500/50"
                          : undefined
                      }
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {submitError ? <p className="text-sm text-destructive">{submitError}</p> : null}

            <DialogFooter className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" className="w-full sm:w-auto flex-1" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button type="submit" className="w-full sm:w-auto flex-1" disabled={isSubmitting}>
                {isSubmitting ? "Creating account..." : "Create account"}
              </Button>
            </DialogFooter>
          </form>

        </Form>
        <div className="border-t border-border mt-2 pt-4 text-center text-sm text-muted-foreground">
          Existing user?{" "}
          <button
            type="button"
            onClick={onSwitchToLogin}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Sign in here
          </button>
        </div>
      </DialogContent>
      
    </Dialog>
  )
}

function LoginDialog({
  open,
  onOpenChange,
  onGoogleSignIn,
  onSwitchToSignUp,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
  onGoogleSignIn: () => void
  onSwitchToSignUp: () => void
}) {
  const { supabase } = useSupabase()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const form = useForm<z.infer<typeof signInSchema>>({
    resolver: zodResolver(signInSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  })

  const isSubmitting = form.formState.isSubmitting

  const handleSubmit = async (values: z.infer<typeof signInSchema>) => {
    setSubmitError(null)

    const { error } = await supabase.auth.signInWithPassword({
      email: values.email,
      password: values.password,
    })

    if (error) {
      setSubmitError(error.message)
      return
    }

    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
     

        <div className="space-y-4 pt-0.5">
          <Button type="button" variant="outline" className="w-full justify-center" onClick={onGoogleSignIn}>
            <GoogleIcon className="h-4 w-4" />
            Sign in with Google
          </Button>

          <div className="relative py-1 text-center">
            <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border" aria-hidden />
            <span className="relative bg-card px-2 text-xs uppercase tracking-wide text-muted-foreground">
              Or continue with
            </span>
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" autoComplete="email" placeholder="you@example.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input type="password" autoComplete="current-password" placeholder="Your password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {submitError ? <p className="text-sm text-destructive">{submitError}</p> : null}

            <DialogFooter className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" className="w-full sm:w-auto flex-1" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button type="submit" className="w-full sm:w-auto flex-1" disabled={isSubmitting}>
                {isSubmitting ? "Signing in..." : "Sign in"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
        <div className="border-t border-border mt-2 pt-4 text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <button
            type="button"
            onClick={onSwitchToSignUp}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Create one
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function RequirementRow({ met, label }: { met: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <Check className={`h-4 w-4 ${met ? "text-emerald-400" : "text-muted-foreground"}`} aria-hidden />
      <span className={met ? "text-emerald-400" : "text-muted-foreground"}>{label}</span>
    </li>
  )
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <path
        fill="#4285F4"
        d="M23.6 12.27c0-.82-.07-1.64-.2-2.44H12v4.62h6.5a5.56 5.56 0 0 1-2.4 3.65v3.03h3.86c2.26-2.1 3.64-5.2 3.64-8.86Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.94-2.92l-3.86-3.03c-1.08.72-2.47 1.14-4.08 1.14-3.14 0-5.8-2.1-6.75-4.94H1.24v3.1A11.99 11.99 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.25 14.25c-.24-.72-.38-1.49-.38-2.25s.14-1.53.38-2.25V6.65H1.24a11.99 11.99 0 0 0 0 10.7l4.01-3.1Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.76 0 3.35.61 4.6 1.8l3.43-3.43C17.96 1.07 15.24 0 12 0A11.99 11.99 0 0 0 1.24 6.65l4.01 3.1C6.2 6.85 8.86 4.75 12 4.75Z"
      />
    </svg>
  )
}
