// While the day loads (canvas 30, motion): the shape of the day shimmering, never a blank page or a "Nothing on the
// calendar" that isn't true yet.

const bar = 'phone-shimmer rounded-full bg-wall-ink/5'

export default function PhoneSkeleton() {
  return (
    <div aria-label="Loading your day" role="status" className="flex flex-col gap-[16px]">
      <div className={`${bar} h-[14px] w-[140px]`} />
      <div className={`${bar} h-[34px] w-[210px]`} />
      <div className="flex gap-[8px]">{['w-[96px]', 'w-[88px]', 'w-[92px]', 'w-[80px]'].map((w) => <div key={w} className={`${bar} h-[40px] ${w}`} />)}</div>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-[12px] border-0 border-t border-solid border-wall-stone py-[12px]">
          <div className={`${bar} h-[16px] w-[44px]`} />
          <div className="h-[40px] w-[4px] rounded-full bg-wall-stone" />
          <div className="flex flex-1 flex-col gap-[8px]">
            <div className={`${bar} h-[16px] w-[70%]`} />
            <div className={`${bar} h-[12px] w-[40%]`} />
          </div>
          <div className={`${bar} h-[26px] w-[26px]`} />
        </div>
      ))}
    </div>
  )
}
