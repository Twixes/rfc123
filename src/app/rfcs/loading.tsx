import Link from 'next/link'

export default function Loading() {
    return (
        <div className="mx-auto min-h-screen max-w-240 px-8 py-12">
            <header className="mb-12 flex items-start justify-between">
                <div>
                    <h1 className="text-5xl font-bold uppercase tracking-tight text-black">
                        <Link href="/" className="hover:underline">
                            RFC123
                        </Link>
                    </h1>
                    <div className="mt-3 h-4 w-64 animate-pulse bg-gray-20" />
                </div>
                <div className="flex items-center gap-4">
                    <div className="h-10 w-10 animate-pulse border-2 border-black bg-gray-20" />
                    <div className="h-10 w-24 animate-pulse border-2 border-black bg-gray-20" />
                </div>
            </header>

            <div className="space-y-0">
                {[...Array(5)].map((_, index) => (
                    <div
                        key={index}
                        className="block border-b-2 border-black bg-white px-6 py-5"
                        style={{
                            borderTop: index === 0 ? "2px solid black" : "none",
                        }}
                    >
                        <div className="flex items-start justify-between gap-6">
                            <div className="flex-1">
                                <div className="mb-2 flex items-baseline gap-3">
                                    <div className="h-7 w-96 animate-pulse bg-gray-20" />
                                    <div className="h-6 w-16 animate-pulse border-2 border-gray-30 bg-gray-10" />
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-2">
                                        <div className="h-5 w-5 animate-pulse border-2 border-black bg-gray-20" />
                                        <div className="h-4 w-24 animate-pulse bg-gray-20" />
                                    </div>
                                    <div className="h-4 w-12 animate-pulse bg-gray-20" />
                                    <div className="h-4 w-24 animate-pulse bg-gray-20" />
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
