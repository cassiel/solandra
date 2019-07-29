import React from "react"
import { Link } from "gatsby"

export default function Header() {
  return (
    <div className="bg-gray-900 px-8 py-4">
      <p className="text-gray-700 text-base">
        <Link to="/">
          <span className="font-bold text-xl mb-2 mr-4 text-blue-600 hover:text-blue-800">
            Solandra
          </span>
        </Link>
        <span className="hidden md:inline text-gray-200">
          A simple, modern TypeScript-first Algorithmic Art Tool
        </span>
        <a
          href="https://github.com/jamesporter/solandra"
          className="underline  ml-2 text-blue-600 hover:text-blue-800"
        >
          Project Source and Docs
        </a>
        <a
          className="underline ml-2 text-blue-600 hover:text-blue-800"
          href="https://github.com/jamesporter/solandra/blob/master/src/sketches.ts"
        >
          (Source Code for example sketches)
        </a>
      </p>
    </div>
  )
}